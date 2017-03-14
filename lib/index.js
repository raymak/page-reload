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
const SESSION_ASK_CAP = n1;
var seqAskProbability;
var sessionAsked = 0;

function setAskProbabilities(N){
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

  seqAskProbability = probArrCdf;
}

setAskProbabilities(SEQUENCE_LIMIT);

function sampleAskProbability(seq_number){
  if (seq_number > SEQUENCE_LIMIT)
    return true;
  return Math.random() < seqAskProbability[seq_number];
}

console.log(seqAskProbability);

function hostnameAskCap(hostname){
  return false;
}

function sessionAskCap(){
  return false;
  return sessionAsked >= SESSION_ASK_CAP;
}

function alwaysPrompt(){
  return false;
}

function dailyAskCap(){
  return false;
}

function shouldAsk(seq_number){
  return alwaysPrompt() ||
    ( sampleAskProbability(seq_number)
     /* && !hostnameCap()
      && !sessionCap()
      && !dailyCap() */
    );
}

new WindowTracker({
  onTrack: function(window){
    if (!isBrowser(window) || isPrivate(window)) return;

    let reloadBtn = window.document.getElementById('urlbar-reload-button');

    reloadBtn.addEventListener('click', (e)=>{
      reload({
        method: 'button',
        altKey: e.altKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey
      });
    });
  }
});

function median(arr){
  arr.sort((a,b)=> a - b);
  let half = Math.floor(arr.length/2);

  if(arr.length % 2)
      return arr[half];
  else
      return (arr[half-1] + arr[half]) / 2.0;
}

function mean(arr){
  if (!arr.length) return;

  let sum = 0;
  for (let i of arr)
      sum += i;
  return sum/arr.length;
}


tabs.on('ready', function onOpen(t){

  let data = tabData.get(t);

  function resetTabData(tab){
    tabData.set(tab, {
        url: t.url,
        last_load_ts: Date.now(),
        sequence: [],
        seq_uuid: require("sdk/util/uuid").uuid().toString().slice(1,-1)
    });
  }

  if (!data) {
    resetTabData(t);
    return;
  }
  
  if (t.url !== data.url){

    let meanDelay = data.sequence.length > 0 ? mean(data.sequence): 0;
    let medianDelay = data.sequence.length > 0 ? median(data.sequence): 0;

    study.telemetry({
      'message_type': 'refresh_sequence',
      'sequence': String(data.sequence),
      'seq_length': String(data.sequence.length),
      'hostname': String(require('sdk/url').URL(data.url).hostname),
      'mean_delay': String(meanDelay),
      'median_delay': String(medianDelay),
      'seq_uuid': data.seq_uuid
    });

    resetTabData(t);
  }
});

function popPanel(){
  let panel = require("sdk/panel").Panel({
    width: 360,
    height: 484,
    contentURL: './html/popup.html',
    contentScriptFile: './js/popup.js'
    });

  panel.port.on('close', function(){panel.hide()});

  panel.show();
}

function ask(){
  popPanel();
  sessionAsked += 1;
}

function reload(prop){
  console.log('reload');
  let t = tabs.activeTab;
  let data = tabData.get(t);

  let now = Date.now();
  let delay = now - data.last_load_ts;
  data.sequence.push(delay);
  console.log(data.sequence);
  data.last_load_ts = now;

  console.log(data);

  study.telemetry({
    'message_type': 'refresh_instance',
    'hostname': String(require('sdk/url').URL(data.url).hostname),
    'method': prop.method,
    'seq_number': String(data.sequence.length),
    'prev_delay': String(delay),
    'seq_uuid': data.seq_uuid,
    'altKey': String(prop.altKey),
    'shiftKey': String(prop.shiftKey),
    'metaKey': String(prop.metaKey),
    'ctrlKey': String(prop.ctrlKey)  
  });

  if (shouldAsk(data.sequence.length))
    ask();
}

// popPanel();
