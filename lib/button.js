"use strict";

const { Class: sdkClass } = require('sdk/core/heritage');
const { getNodeView } = require('sdk/view/core');

const Button = sdkClass({
  initialize(chromeWindow) {
    this.doc = chromeWindow.document;
    this.button = this.doc.getElementById('urlbar');

    // this.button = this.doc.createElement('div');
    // this.button.id = 'fake-button';
    // this.doc.getElementById('urlbar-wrapper').appendChild(this.button);
  }
  // destroy() {
  // },
  // show() {
  // },
  // hide() {
  // }
});
getNodeView.define(Button, (button) => button.button);

exports.Button = Button;

