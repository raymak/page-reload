const shield = require("shield-studies-addon-utils");
const self = require('sdk/self');

const unload = require("sdk/system/unload").when;

function setup(cleanupHandle){
  class ThisStudy extends shield.Study {
    cleanup(){
      super.cleanup();
      cleanupHandle();
    }
  }

  let config = {};
  const thisStudy = new ThisStudy(config);

  thisStudy.startup(self.loadReason);
  unload((reason) => thisStudy.shutdown(reason));

  return thisStudy;
}

exports.setup = setup;


