'use strict';

const { expect } = require('chai');
var express = require('express');
var _ = require('lodash');
var Rounds = require('../../../modules/rounds.js');
var modulesLoader = require('../../common/initModule').modulesLoader;

describe('rounds', function () {
  var rounds;

  before(function (done) {
    modulesLoader.initModuleWithDb(Rounds, function (err, __rounds) {
      if (err) {
        return done(err);
      }
      rounds = __rounds;
      done();
    });
  });

  describe('calc', function () {
    it('should calculate round number from given block height', function () {
      expect(rounds.calc(100)).equal(1);
      expect(rounds.calc(200)).equal(2);
      expect(rounds.calc(303)).equal(3);
      expect(rounds.calc(304)).equal(4);
    });

    it('should calculate round number from Number.MAX_VALUE', function () {
      var res = rounds.calc(Number.MAX_VALUE);
      expect(_.isNumber(res)).to.be.ok;
      expect(res).to.be.below(Number.MAX_VALUE);
    });
  });
});
