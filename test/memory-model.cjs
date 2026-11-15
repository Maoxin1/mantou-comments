'use strict';
// Test fixture only. This is not a database adapter or a durability oracle.
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === '_complex') {
      const clauses = Object.entries(value).filter(([field]) => field !== '_logic');
      return value._logic === 'or'
        ? clauses.some(([field, expected]) => matches(row, { [field]: expected }))
        : clauses.every(([field, expected]) => matches(row, { [field]: expected }));
    }
    if (!Array.isArray(value)) return row[key] === value;
    const [operator, operand] = value;
    if (operator === 'IN') return operand.includes(row[key]);
    if (operator === 'NOT IN') return !operand.includes(row[key]);
    if (operator === '>') return new Date(row[key]) > new Date(operand);
    if (operator === '!=') return row[key] !== operand;
    throw new Error(`Unsupported test-model operator: ${operator}`);
  });
}
class MemoryModel {
  constructor(rows = []) { this.rows = structuredClone(rows); this.nextId = 1; }
  async select(where = {}, options = {}) {
    const rows = this.rows.filter((row) => matches(row, where));
    if (options.order) rows.sort((a, b) => {
      for (const { field, direction } of options.order) {
        const delta = a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0;
        if (delta) return direction === 'desc' ? -delta : delta;
      }
      return 0;
    });
    return structuredClone(rows.slice(options.offset || 0, options.limit ? (options.offset || 0) + options.limit : undefined));
  }
  async count(where = {}, options = {}) {
    const rows = await this.select(where);
    if (!options.group) return rows.length;
    const groups = new Map();
    for (const row of rows) {
      const key = JSON.stringify(options.group.map((field) => row[field]));
      const item = groups.get(key) || { ...Object.fromEntries(options.group.map((field) => [field, row[field]])), count: 0 };
      item.count++; groups.set(key, item);
    }
    return [...groups.values()];
  }
  async add(data) {
    const row = { ...structuredClone(data), objectId: `fixture${this.nextId++}` };
    this.rows.push(row); return structuredClone(row);
  }
  async update(data, where) {
    const rows = this.rows.filter((row) => matches(row, where));
    for (const row of rows) Object.assign(row, structuredClone(data));
    return structuredClone(rows);
  }
  // Test-only equivalent of the adapter's atomic predicate; update() mutates
  // synchronously so concurrent fixtures cannot interleave select and write.
  async transitionStatus({ objectId, from, to, url }) {
    const [row] = await this.update({ status: to }, { objectId, status: from, url });
    return row ?? null;
  }
  async delete(where) { this.rows = this.rows.filter((row) => !matches(row, where)); }
}
module.exports = { MemoryModel };
