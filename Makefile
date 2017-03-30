# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/. 
# 
# 
VERSION ?= $(shell python -c "import json;print(json.load(open('package.json'))['version'])")
BUILD_ROOT_DIR = build
BUILD_NAMES = $(sort $(notdir $(wildcard $(BUILD_ROOT_DIR)/*)))
TOP ?= $(shell pwd)
NAME=shield-study-page-reload

PEOPLEREMOTEMACHINE=people.mozilla.org
PEOPLEREMOTEDIR=~kardekani/public_html/page-reload/test

WHO=kardekani@

all: clean xpi rename

all-sign: clean xpi rename sign replace-with-signed

# sets up a certain experiment configuration by copying all the contents of a certain 
# build/[config-name] to the main directory, most notably the prefs.json file
# e.g. make 1-day-test
# 
$(BUILD_NAMES):
	@echo "setting up $@..."
	@cp -R -v $(BUILD_ROOT_DIR)/$@/* ./

# makes the xpi file
xpi:
	jpm xpi

rename:
	-mv @$(NAME)*.xpi $(NAME).xpi 
	-mv @$(NAME)*.update.rdf $(NAME).update.rdf

deploy:

sign:
	jpm sign --api-key $(API_USERKEY) --api-secret $(API_PASS) --xpi $(NAME).xpi

people-deploy: 
	cd $(TOP)
	scp -rp $(NAME)*.update.rdf $(WHO)$(PEOPLEREMOTEMACHINE):$(PEOPLEREMOTEDIR)/$(NAME).update.rdf
	scp -rp $(NAME)*.xpi $(WHO)$(PEOPLEREMOTEMACHINE):$(PEOPLEREMOTEDIR)/$(NAME).xpi
# would be nice if then curled.

clean: 
	-rm -f *.xpi
	-rm -f *.update.rdf

replace-with-signed:
	rm -f @$(NAME)*.xpi
	mv *-fx.xpi $(NAME).xpi


