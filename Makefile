.DELETE_ON_ERROR:

# Injects the discovery script (after trimming it) into the template
template.dist.yaml: template.yaml .discovery_script.trimmed.js
	@printf '# This is a generated file, do not modify manually.\n# All modifications should happen in these files\n#  template.yaml discovery_script.js\n' > $@
	yq '.zabbix_export.templates[0].discovery_rules[].params |= loadstr(".discovery_script.trimmed.js")' template.yaml >> $@
	rm .discovery_script.trimmed.js

# Removes type annotations and noinspection comments
.discovery_script.trimmed.js: discovery_script.js
	 grep -v '^[[:space:]]*// noinspection' $< | grep -v '^/\*' | grep -v '^\ *\*'  > $@

# Run yamllint on template.yaml
lint: template.yaml
	yamllint template.yaml
.PHONY: lint
