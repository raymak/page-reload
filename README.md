# Page Reload Study
`page-reload` is the Firefox add-on used for a [Shield study](https://wiki.mozilla.org/Firefox/Shield/Shield_Studies) aimed at understanding the feasibility and effectiveness of predicting page breakage from users' page reload behavior and feedback. This could eventually help report broken websites automatically and improve the web compatibility of Firefox.

## Hypothesis
The number of page reloads for a page paired with the hostname of that page gives a significant prediction power of page breakage.

## Task
When the user reloads a webpage, the addon prompts her with a certain chance. The prompt asks the user about why she reloaded that page. See picture below.

<div align="center">
    <img alt="The prompt asking the user about why she reloaded a web page." src="https://people-mozilla.org/~kardekani/page-reload/screenshots/browser-ss.png" height="400px"/>
</div>

## Data Collection

The `page-reload` [Shield study](https://wiki.mozilla.org/Firefox/Shield/Shield_Studies) logs a participant's Firefox usage data that is related to reloading web pages and problems in a page. In particular, it collects:

- when a page is reloaded as well as the method used for reloading (e.g. modifier keys)
- the hostname (e.g. facebook.com, maps.google.com) of reloaded pages
- whether the page has HTML5 video or flash objects in it
- participant's interaction with the prompts

NOTE: in private browsing mode no data is collected

The collected data is transferred through Shield [Telemetry](https://wiki.mozilla.org/Telemetry) pings to Mozilla along with the usual [environment ping](http://gecko.readthedocs.io/en/latest/toolkit/components/telemetry/telemetry/data/environment.html) data from Telemetry. 


The schema for messages sent to Telemetry can be found [here](https://github.com/raymak/page-reload/blob/master/schemas/schema.json).