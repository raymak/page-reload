const { when: unload } = require("sdk/system/unload");
const shield = require("shield-studies-addon-utils");

require("../package.json") ///

// no surveyUrl, name as addonId, 1 variation, 7 days
const thisStudy = new shield.Study({});

exports.study = thisStudy;

