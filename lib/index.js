"use strict";

const self = require('sdk/self');
const {study} = require('./study');
const {log} = require('./log');
const {Button} = require('./button.js');
const {WindowTracker} = require('sdk/deprecated/window-utils');
const {isBrowser, getMostRecentBrowserWindow} = require('sdk/window/utils');
const {isPrivate} = require('sdk/private-browsing');
const tabs = require('sdk/tabs');
const unload = require("sdk/system/unload").when;
const {Cu}= require('chrome');
const {storage} = require('sdk/simple-storage');
const sp = require('sdk/simple-prefs').prefs;
const {URL} = require('sdk/url');
const {PageMod} = require('sdk/page-mod');
const {uuid} = require('sdk/util/uuid');
const {platform} = require('sdk/system');
const {Panel} = require('sdk/panel');

study.startup(self.loadReason);

const SEQUENCE_ASK_UPPERBOUND = sp['sequence_ask_upperbound'];
const SESSION_ASK_CAP = sp['session_ask_cap'];
const PER_HOSTNAME_ASK_CAP = sp['per_hostname_ask_cap'];
const sessionUuid = uuid().toString().slice(1,-1); 

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

  static standardDeviation(values){
    let avg = this.mean(values);
    
    let squareDiffs = values.map(value=>{
      var diff = value - avg;
      var sqrDiff = diff * diff;
      return sqrDiff;
    });
    
    let avgSquareDiff = this.mean(squareDiffs);

    let stdDev = Math.sqrt(avgSquareDiff);
    return stdDev;
  }
}

class ReloadInstance {
  constructor(ts, method, modKeys, attributes){
    this.ts = ts;
    this.method = method;
    this.modKeys = modKeys;
    this.attributes = attributes;
    this.reaction = 'no-ask';
    this.asked = false;
  }
}

class ReloadSequence {
  constructor(hostname){
    this.uuid = uuid().toString().slice(1,-1);
    this.hostname = hostname;
    this.instances = [];
    this.delays = [];
    this.loadTs = Date.now();
    this.stats = {meanDelay: 0, medianDelay: 0, delaySd: 0};
    this.reaction = 'no-ask';
    this.asked = false;
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
    let delaySd = this.length > 0 ? Stats.standardDeviation(this.delays): 0;

    this.stats = {meanDelay, medianDelay, delaySd};
  }

  createInstance(method, modKeys, attributes){
    this.addInstance(new ReloadInstance(Date.now(), method, modKeys, attributes));
  }

  addReaction(r){
    this.lastInstance.reaction = r;
    this.reaction = r;
  }

  setAsked(){
    this.asked = true;
    this.lastInstance.asked = true;
    this.reaction = 'no-reaction';  // assumes each sequence only gets one ask
    this.lastInstance.reaction = 'no-reaction';
  }

  get length(){return this.instances.length}
  get lastInstance(){
    return this.instances.length > 0? this.instances[this.instances.length-1] : null;
  }

  reportLastInstance(){
    let ls = this.lastInstance;

    if (!ls) return;

    log("reporting instance");

    study.telemetry({
      'message_type': 'reload_instance',
      'hostname': this.hostname,
      'method': ls.method,
      'pos_in_sequence': String(this.length),
      'prev_delay': String(this.delays[this.delays.length-1]),
      'seq_uuid': this.uuid,
      'session_uuid': sessionUuid,
      'asked': String(ls.asked),
      'reaction': ls.reaction,
      'attributes_html5video': ls.attributes['html5video'] || 'false',
      'attributes_naiveflash': ls.attributes['naiveflash'] || 'false',
      'mod_keys_altKey': String(ls.modKeys.altKey),
      'mod_keys_shiftKey': String(ls.modKeys.shiftKey),
      'mod_keys_metaKey': String(ls.modKeys.metaKey),
      'mod_keys_ctrlKey': String(ls.modKeys.ctrlKey) 
    });

    if (!ls.asked) return; 

    // report the reaction separately
    study.telemetry({
      'message_type': 'ask_reaction',
      'hostname': this.hostname,
      'method': ls.method,
      'pos_in_sequence': String(this.length),
      'prev_delay': String(this.delays[this.delays.length-1]),
      'seq_uuid': this.uuid,
      'session_uuid': sessionUuid,
      'reaction': ls.reaction,
      'attributes_html5video': ls.attributes['html5video'] || 'false',
      'attributes_naiveflash': ls.attributes['naiveflash'] || 'false',
      'mod_keys_altKey': String(ls.modKeys.altKey),
      'mod_keys_shiftKey': String(ls.modKeys.shiftKey),
      'mod_keys_metaKey': String(ls.modKeys.metaKey),
      'mod_keys_ctrlKey': String(ls.modKeys.ctrlKey)  
    });
  }

  report(){
    if (this.length > 0) this.reportLastInstance();

    study.telemetry({
      'message_type': 'reload_sequence',
      'delays': String(this.delays),
      'length': String(this.length),
      'hostname': String(this.hostname),
      'asked': String(this.asked),
      'reaction': this.reaction,
      'stats_mean_delay': String(this.stats.meanDelay),
      'stats_median_delay': String(this.stats.medianDelay),
      'stats_delay_sd': String(this.stats.delaySd),
      'session_uuid': sessionUuid,
      'uuid': this.uuid
    });
  }
}

class PageReloadMonitor{
  constructor(){
    this.seqAskProbability = PageReloadMonitor.setAskProbabilities(SEQUENCE_ASK_UPPERBOUND);

    log('Ask probability distribution: ', this.seqAskProbability);

    this.tabData = new WeakMap();
    this.tab2Worker = new WeakMap();
    this.window2Button = new WeakMap();
    this.sessionAsked = 0;

    this.start();
  }

  static setAskProbabilities(N){
    // based on an ascending triangle distribution
    // a = 1, b = c = N
    
    let probArrInt = Array.from(Array(N).keys());
    log(probArrInt);
    let probArrCummInt = []
    let probArrCdf = []

    for (let i in probArrInt)
      probArrCummInt.push((0.5)*(Number(i)+1)*(probArrInt[i])) // Arithmetic Series http://mathworld.wolfram.com/ArithmeticSeries.html Sn = 1/2 * n * (a1+an)

    log(probArrCummInt);

    let sum = probArrCummInt[probArrCummInt.length-1];

    for (let i in probArrCummInt)
      probArrCdf.push(probArrCummInt[i]/sum);

    return probArrCdf;
  }

  sampleAskProbability(seqPos){
    if (seqPos > SEQUENCE_ASK_UPPERBOUND)
      return true;
    return Math.random() < this.seqAskProbability[seqPos];
  }

  shouldAsk(seqPos, hostname){
    return sp['always_ask'] || (this.sampleAskProbability(seqPos) 
                            && !this.sessionAskCap() 
                            && !this.hostnameAskCap(hostname)
                            && !this.dailyAskCap());
  }

  hostnameAskCap(hostname){
    if (!storage.hostnameAsks || !storage.hostnameAsks.get(hostname)) 
      return false;

    return (storage.hostnameAsks.get(hostname) >= PER_HOSTNAME_ASK_CAP);
  }

  incrementHostnameAsks(hostname){
    log(`incrementing hostname asks for ${hostname}`);

    if (!storage.hostnameAsks){
      storage.hostnameAsks = new Map();
      storage.hostnameAsks.set(hostname, 1);
      return;
    }

    let hostnameAsks = storage.hostnameAsks;

    if (!hostnameAsks.get(hostname)){
      storage.hostnameAsks.set(hostname, 1);
      return;
    }

    hostnameAsks.set(hostname, hostnameAsks.get(hostname) + 1);
    storage.hostnameAsks = hostnameAsks;

    log(`ask count for ${hostname}: `, storage.hostnameAsks.get(hostname));
  }

  sessionAskCap(){
    return this.sessionAsked >= SESSION_ASK_CAP;
  }

  dailyAskCap(){
    return false;
  }

  listenForReload(){
    log('listening for reload behavior...');

    let that = this;

    new WindowTracker({
      onTrack: function(window){
        if (!isBrowser(window) || isPrivate(window)) return;

        // make a SDK button out of the reload button so that the panel can be attached to the button
        let rldBtn = Button(window);
        that.window2Button.set(window, rldBtn);

        // reload hotkey
        let wd = Cu.getWeakReference(window);

        let onKeydown = function(e){
          let isDarwin = platform == 'darwin';

          let modKeys = {
                    altKey: e.altKey,
                    metaKey: e.metaKey,
                    shiftKey: e.shiftKey,
                    ctrlKey: e.ctrlKey
                  };

          // F5
          if (e.key == 'F5') that.reload('hotkey', modKeys);

          if (e.key.toLowerCase() == 'r' &&
             (isDarwin && modKeys.metaKey || !isDarwin && modKeys.ctrlKey)){
                that.reload('hotkey', modKeys)
              }
        }
        wd.get().addEventListener('keydown', onKeydown);
        unload(function(){
          if (wd.get())
            wd.get().removeEventListener('keydown', onKeydown);
        });

        // kill the listener on unload?
        
        // reload button
        let reloadBtn = Cu.getWeakReference(window.document.getElementById('urlbar-reload-button'));

        let onClick = function(e){

          let modKeys = {
                    altKey: e.altKey,
                    metaKey: e.metaKey,
                    shiftKey: e.shiftKey,
                    ctrlKey: e.ctrlKey
                  };

          that.reload('button', modKeys);
        } 
        reloadBtn.get().addEventListener('click', onClick);
        unload(function(){
          if (reloadBtn.get())
            reloadBtn.get().removeEventListener('click', onClick);
        });
      }
    });
  }

  updatePageAttribute(tab, attribute, value){
    let data = this.tabData.get(tab);
    data.attributes[attribute] = value;
    this.tabData.set(tab, data);

    log(`new ${attribute}: ${value}`);
  }

  listenForTabLoad(){
    log('listening for tab load...');

    let that = this;

    tabs.on('ready', function onReady(t){
      let data = that.tabData.get(t);

      function resetTabData(tab){
        that.tabData.set(tab, {
            url: t.url,
            sequence: new ReloadSequence(String(URL(tab.url).hostname)),
            attributes: {}
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

  injectPageAgent(){
    let that = this;

    PageMod({
      include: ["*"],
      contentScriptFile: './js/page-agent.js',
      onAttach: function onAttach(worker) {
        that.tab2Worker.set(worker.tab, worker);

        worker.port.on('page-attribute', (data)=>{ // data == [string attribute, string value]
          that.updatePageAttribute(worker.tab, data[0], data[1]);
        });
      }
    });
  }

  popPanel(reactionCallback){
    // panel inits every time it pops
    
    let that = this;

    let panel = Panel({
      width: 310,
      height: 310,
      contentURL: './html/popup.html',
      contentScriptFile: './js/popup.js'
      });

    panel.port.on('close', ()=>{
      panel.hide();
    });
    panel.port.on('problem', ()=> {log('PROBLEM')});
    panel.port.on('reaction', (r) =>{
      reactionCallback(r);
    });

    if (sp['panel-type'] == 1){
      panel.show({position: that.window2Button.get(getMostRecentBrowserWindow())});
    } else {
      panel.show();
    }
  }

  destroy(){
    // clean up simple storage
    delete storage.hostnameAsks;
  }

  reload(method, modKeys){
    log('reload');

    let t = tabs.activeTab;
    let data = this.tabData.get(t);

    data.sequence.reportLastInstance();
    data.sequence.createInstance(method, modKeys, data.attributes);

    log(data);
    log('had video? ', data.attributes['html5video']);
    log('last page title: ', data.attributes['page-title']);

    if (!data.sequence.asked && this.shouldAsk(data.sequence.length, data.sequence.hostname))
      this.ask(data.sequence.hostname);
  }

  ask(hostname) {
    log(`asking: ${hostname}`);
    
    let that = this;

    this.tabData.get(tabs.activeTab).sequence.setAsked();

    this.popPanel(function reactionCallback(r){
      that.tabData.get(tabs.activeTab).sequence.addReaction(r);  
      log('reactionCallback', r);

    });

    this.sessionAsked += 1;
    this.incrementHostnameAsks(hostname);
  }

  start(){
    this.listenForReload();
    this.listenForTabLoad();
    this.injectPageAgent();
  }
}

new PageReloadMonitor();
