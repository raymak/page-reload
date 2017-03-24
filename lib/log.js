const sp = require('sdk/simple-prefs').prefs;

/*eslint no-console: ["error", { allow: ["log"] }] */
/*eslint no-empty-function: ["error", { "allow": ["functions"] }]*/

if (sp['debug']){
  exports.log = console.log.bind(console)
} else {
  exports.log = function(){}
}
