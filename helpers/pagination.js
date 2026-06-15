
/**
 * Calculates limit and offset for both SQL and the `mergeUnconfirmedTransactions()` method.
 *
 * @description
 *
 *  * Goal: return a window `[offset … offset+limit)` of the **global timeline**:
 *        ┌────┬────┬────┬────┬────┬────┬────┐
 *        │ U0 │ U1 │ …  │ Un │ C0 │ C1 │ …  │
 *        └────┴────┴────┴────┴────┴────┴────┘
 *        ↑unconfirmed↑          ↑confirmed rows in DB↑
 *
 * The DB has only confirmed rows (C-rows).  Unconfirmed rows (U-rows) live
 * in local array and sit *ahead* of everything when you sort by timestamp.
 *
 * Problem: the HTTP client sends paging relative to the **merged** list
 *           (U + C), but SQL can only see the C-part.
 *
 * Solution: "over-fetch" confirmed rows so the DB result still covers the
 *            caller’s slice after the U-rows are injected.
 *
 * @param {object} params user's `offset` and `limit` params
 * @param {number} utxs number of unconfirmed transactions
 */
const preparePaging = (params, utxs) => {
  const result = {
    db: {
      offset: params.offset,
      limit: params.limit
    },
    merge: {
      offset: 0,
      limit: params.limit
    }
  };

  const userOffset = params.offset;
  const userLimit = params.limit;

  const confirmedOffset = Math.max(0, userOffset - utxs);
  const confirmedLimit = userLimit + Math.min(userOffset, utxs);

  result.db.offset = confirmedOffset;
  result.db.limit = confirmedLimit;

  result.merge.offset = userOffset - confirmedOffset;
  result.merge.limit = userLimit;

  return result;
};

module.exports = {
  preparePaging
};
