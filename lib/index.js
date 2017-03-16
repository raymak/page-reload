const self = require('sdk/self');
const {study} = require('./study');
const {WindowTracker} = require('sdk/deprecated/window-utils');
const {getMostRecentBrowserWindow, isBrowser} = require('sdk/window/utils');
const {isPrivate} = require('sdk/private-browsing');
const tabs = require('sdk/tabs');
const {Cu}= require('chrome');
study.startup(self.loadReason);


const tabData = new WeakMap();
const SEQUENCE_LIMIT = 10;
const SESSION_ASK_CAP = 1;
var sessionAsked = 0;

class Stats {
  static median(arr){
    arr.sort((a,b)=> a - b);
    let half = Math.floor(arr.length/2);

    if(arr.length % 2)
        return arr[half];
    else
        return (arr[half-1] + arr[half]) / 2.0;
  }

  static mean(arr){
    if (!arr.length) return;

    let sum = 0;
    for (let i of arr)
        sum += i;
    return sum/arr.length;
  }
}

class ReloadInstance {
  constructor(ts, method, modKeys){
    this.ts = ts;
    this.method = method;
    this.modKeys = modKeys;
  }
}

class ReloadSequence {
  constructor(hostname){
    this.uuid = require("sdk/util/uuid").uuid().toString().slice(1,-1);
    this.hostname = hostname;
    this.instances = [];
    this.delays = [];
    this.loadTs = Date.now();
    this.stats = {meanDelay: 0, medianDelay: 0};
  }

  addInstance(instance){

    if (this.length > 0)
      this.delays.push(instance.ts - this.lastInstance.ts);
    else
      this.delays.push(instance.ts - this.loadTs)

    this.instances.push(instance);

    //NOTE: for now, the first delay is calculated as the delay between the first reload and the page load
    //
    let meanDelay = this.length > 0 ? Stats.mean(this.delays): 0;
    let medianDelay = this.length > 0 ? Stats.median(this.delays): 0;

    this.stats = {meanDelay, medianDelay};
  }

  createInstance(method, modKeys){
    this.addInstance(new ReloadInstance(Date.now(), method, modKeys));
  }

  get length(){return this.instances.length}
  get lastInstance(){return this.instances[this.instances.length-1]}

  reportLastInstance(){

    let ls = this.lastInstance;

    console.log("reporting instance");

    study.telemetry({
      'message_type': 'reload_instance',
      'hostname': this.hostname,
      'method': ls.method,
      'pos_in_sequence': String(this.length),
      'prev_delay': String(this.delays[this.delays.length-1]),
      'seq_uuid': this.uuid,
      'mod_keys_altKey': String(ls.modKeys.altKey),
      'mod_keys_shiftKey': String(ls.modKeys.shiftKey),
      'mod_keys_metaKey': String(ls.modKeys.metaKey),
      'mod_keys_ctrlKey': String(ls.modKeys.ctrlKey)  
    });
  }

  report(){
    study.telemetry({
      'message_type': 'reload_sequence',
      'delays': String(this.delays),
      'length': String(this.length),
      'hostname': String(this.hostname),
      'stats_mean_delay': String(this.stats.meanDelay),
      'stats_median_delay': String(this.stats.medianDelay),
      'uuid': this.uuid
    });
  }
}

class PageReloadMonitor{
  constructor(){
    this.seqAskProbability = PageReloadMonitor.setAskProbabilities(SEQUENCE_LIMIT);

    console.log('Ask probability distribution: ', this.seqAskProbability);

    this.start();
  }

  static setAskProbabilities(N){
    // based on an ascending triangle distribution
    // a = 1, b = c = N
    
    let probArrInt = Array.from(Array(N).keys());
    console.log(probArrInt);
    let probArrCummInt = []
    let probArrCdf = []

    for (let i in probArrInt)
      probArrCummInt.push((0.5)*(Number(i)+1)*(probArrInt[i])) // Arithmetic Series http://mathworld.wolfram.com/ArithmeticSeries.html Sn = 1/2 * n * (a1+an)

    console.log(probArrCummInt);

    let sum = probArrCummInt[probArrCummInt.length-1];

    for (let i in probArrCummInt)
      probArrCdf.push(probArrCummInt[i]/sum);

    return probArrCdf;
  }

  sampleAskProbability(seqPos){
    if (seqPos > SEQUENCE_LIMIT)
      return true;
    return Math.random() < seqAskProbability[seqPos];
  }

  shouldAsk(seqPos){
    return alwaysPrompt() ||
           (this.sampleAskProbability(seqPos)
         /* && !hostnameCap()
            && !sessionCap()
            && !dailyCap() */
           );
  }

  hostnameAskCap(hostname){
    return false;
  }

  sessionAskCap(){
    return false;
    return sessionAsked >= SESSION_ASK_CAP;
  }

  alwaysPrompt(){
    return false;
  }

  dailyAskCap(){
    return false;
  }

  listenForReload(){

    console.log('listening for reload behavior...');

    let that = this;

    new WindowTracker({
        onTrack: function(window){
        if (!isBrowser(window) || isPrivate(window)) return;


        // reload button
        let reloadBtn = window.document.getElementById('urlbar-reload-button');

        reloadBtn.addEventListener('click', (e)=>{

          let modKeys = {
                    altKey: e.altKey,
                    metaKey: e.metaKey,
                    shiftKey: e.shiftKey,
                    ctrlKey: e.ctrlKey
                  };

          that.reload('button', modKeys);
        });
      }
    });
  }

  listenForTabLoad(){

    console.log('listening for tab load...');

    tabs.on('ready', function onOpen(t){

      let data = tabData.get(t);

      function resetTabData(tab){
        tabData.set(tab, {
            url: t.url,
            sequence: new ReloadSequence(String(require('sdk/url').URL(tab.url).hostname))
        });
      }

      if (!data) {
        resetTabData(t);
        return;
      }
      
      if (t.url !== data.url){  // URL has changed, we consider this a new reload sequence
        // NOTE: for now we do not report reload sequences that don't contain any reloads
        if (data.sequence.length > 0)
          data.sequence.report();

        resetTabData(t);
      }
    });

  }

  popPanel(){
    let panel = require("sdk/panel").Panel({
      width: 360,
      height: 484,
      contentURL: './html/popup.html',
      contentScriptFile: './js/popup.js'
      });

    panel.port.on('close', ()=>{panel.hide()});
    panel.port.on('problem', ()=> {console.log('PROBLEM')});

    panel.show();
  }

  reload(method, modKeys){
    console.log('reload');

    let t = tabs.activeTab;
    let data = tabData.get(t);

    data.sequence.createInstance('button', modKeys);
    data.sequence.reportLastInstance();

    console.log(data);

    if (this.shouldAsk(data.sequence.length))
      this.ask();
  }

  ask() {
    popPanel();
    sessionAsked += 1;
  }

  start(){
    this.listenForReload();
    this.listenForTabLoad();
  }
}

new PageReloadMonitor();
