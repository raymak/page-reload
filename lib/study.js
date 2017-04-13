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

  const surveyUrl = 'http://www.surveygizmo.com/s3/3470260/Page-Reload-End-of-Study';

  let config = {
    duration: 7,
    surveyUrls: {
      'expired': surveyUrl,
      'user-disable': surveyUrl,
      ineligible: null
    }
  };
  const thisStudy = new ThisStudy(config);

  thisStudy.startup(self.loadReason);
  unload((reason) => thisStudy.shutdown(reason));

  return thisStudy;
}

exports.setup = setup;


