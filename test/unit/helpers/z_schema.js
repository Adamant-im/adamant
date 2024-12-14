const { expect } = require('chai');
const z_schema = require('../../../helpers/z_schema.js');

const test = it;

describe('Schema formats', () => {
  /**
   * @type {z_schema}
   */
  let validator;

  beforeEach(() => {
    validator = new z_schema();
  });

  function expectFormatToBeRegistered(formatName) {
    const registeredFormats = z_schema.getRegisteredFormats();
    expect(registeredFormats).to.include(formatName);
  }

  describe('version', () => {
    it('should be registered', () =>
      expectFormatToBeRegistered('version'),
    );

    const schema = {
      id: 'test.schema',
      type: 'object',
      properties: {
        version: {
          type: 'string',
          format: 'version',
        },
      },
      required: ['version'],
    };

    describe('should pass for valid versions', () => {
      const validVersions = [
        '',
        '0.8.3',
        '0.6.0',
        '0.8.4-dev.0',
        '1.0.0',
        '1.2.3-beta',
        '2.1.0-alpha.1',
        '3.3.3-rc.2',
        '4.0.0+build.123',
        '1.0.0-alpha+001',
      ];

      validVersions.forEach((version) => {
        test(`"${version}"`, () => {
          const isValid = validator.validate({ version }, schema);
          expect(isValid).to.be.true;
        });
      });
    });

    describe('should fail for invalid versions', () => {
      const invalidVersions = [
        '0..1',
        '.1.2',
        '1.2.3.4',
        '1.2.-3',
        '1.2.3-rc.01.1',
        'version1.2.3',
        '1.0',
        '01.2.3',
        '1.2.3+',
        '1.2.3+build.@@@',
      ];

      invalidVersions.forEach((version) => {
        test(`"${version}"`, () => {
          const isValid = validator.validate({ version }, schema);
          expect(isValid).to.be.false;
        });
      });
    });

    describe('should fail miserably for invalid types', () => {
      const invalidTypes = [
        null,
        undefined,
        123,
        0.8,
        true,
        false,
        {},
        [],
      ];

      invalidTypes.forEach((type) => {
        test(`${JSON.stringify(type)}`, () => {
          const isValid = validator.validate({ version: type }, schema);
          expect(isValid).to.be.false;
        });
      });
    });
  });
});
