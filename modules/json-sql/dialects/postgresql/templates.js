'use strict';

var _ = require('underscore');
var templateChecks = require('../../utils/templateChecks');

module.exports = function(dialect) {
	var explainFormatRegExp = /^(text|xml|json|yaml)$/i;

	dialect.templates.add('explain', {
		pattern: 'explain {options} {analyze} {verbose} {query} {select} {expression}',
		validate: function(type, params) {
			templateChecks.atLeastOneOfProps(type, params, ['query', 'select', 'expression']);
			templateChecks.onlyOneOfProps(type, params, ['query', 'select', 'expression']);

			templateChecks.propType(type, params, 'options', 'object');

			if (!_.isUndefined(params.options)) {
				templateChecks.atLeastOneOfProps(
					'explain:options',
					params.options,
					['analyze', 'verbose', 'costs', 'buffers', 'timing', 'format']
				);
				templateChecks.propType('explain:options', params.options, 'analyze', 'boolean');
				templateChecks.propType('explain:options', params.options, 'verbose', 'boolean');
				templateChecks.propType('explain:options', params.options, 'costs', 'boolean');
				templateChecks.propType('explain:options', params.options, 'buffers', 'boolean');
				templateChecks.propType('explain:options', params.options, 'timing', 'boolean');
				templateChecks.propType('explain:options', params.options, 'format', 'string');
				templateChecks.propMatch('explain:options', params.options, 'format', explainFormatRegExp);
			}

			templateChecks.propType(type, params, 'analyze', 'boolean');
			templateChecks.propType(type, params, 'verbose', 'boolean');
		}
	});

	// patch parent select template to add some blocks
	var selectTemplate = dialect.templates.get('select');
	selectTemplate.pattern = selectTemplate.pattern.replace('{distinct}', '{distinct} {distinctOn}');

	var parentSelectValidate = selectTemplate.validate;
	selectTemplate.validate = function(type, params) {
		parentSelectValidate(type, params);

		templateChecks.propType(type, params, 'distinctOn', ['string', 'array']);
	};

	dialect.templates.set('select', selectTemplate);
};
