
"use strict";

self.port.emit('page-attribute', ['page-title', window.document.title]);

function lookForVideo(){
  if (constainsHTML5Video())
    self.port.emit('page-attribute', ['html5video', 'true']);

  if (containsSWFObjects())
    self.port.emit('page-attribute', ['naiveflash', 'true']);
}

function constainsHTML5Video(){
  let v = document.querySelector('video');

  return !!v;
}

// https://gist.github.com/BlaM/6614a298080f126018ebf07ad408dc5a
function containsSWFObjects() {
  let s, 
      selectors = [
    'object param[name="movie"][value*=".swf"]',
    'object param[name="src"][value*=".swf"]',
    'embed[src*=".swf"]',
    'object[data*=".swf"]'
  ];

  while (s = selectors.pop()) {
    if (document.querySelectorAll(s).length) {
      return true;
    }
  }
  return false;
}

lookForVideo();