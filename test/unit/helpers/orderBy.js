const { expect } = require('chai');
const OrderBy = require('../../../helpers/orderBy.js');

describe('orderBy', () => {
  describe('formatSQLSorting()', () => {
    it('should sort timestamp by timestampMs with timestamp fallback', () => {
      const orderBy = OrderBy('timestamp:desc', {
        sortFields: ['timestamp'],
        sortField: 'timestamp',
        sortMethod: 'DESC'
      });

      const sorting = OrderBy.formatSQLSorting({
        ...orderBy,
        timestampField: '"t_timestamp"',
        timestampMsField: '"t_timestampMs"'
      });

      expect(sorting).to.equal(
          'COALESCE("t_timestampMs", ("t_timestamp")::bigint * 1000) DESC, "t_timestamp" DESC'
      );
    });

    it('should keep regular single-field sorting unchanged', () => {
      const orderBy = OrderBy('amount:asc', {
        sortFields: ['amount']
      });

      const sorting = OrderBy.formatSQLSorting(orderBy);

      expect(sorting).to.equal('"amount" ASC');
    });
  });
});
