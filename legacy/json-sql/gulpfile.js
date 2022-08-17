'use strict';

var gulp = require('gulp');
var mocha = require('gulp-mocha');
var jshint = require('gulp-jshint');

gulp.task('test', function() {
	return gulp.src(['./tests/*.js'], {read: false})
		.pipe(
			mocha({
				reporter: 'spec',
				bail: true
			})
		);
});

gulp.task('lint', function() {
	return gulp.src('./lib/**/*.js')
		.pipe(jshint())
		.pipe(jshint.reporter('unix'));
});

gulp.task('lintTests', function() {
	return gulp.src('./tests/*.js')
		.pipe(jshint())
		.pipe(jshint.reporter('unix'));
});