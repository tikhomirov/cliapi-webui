/**
 * @fileoverview Reusable table component with sorting and actions.
 */

import { h } from '../core/utils.js';

/**
 * Create a data table.
 * @param {object} opts
 * @param {Array<{key: string, label: string, width?: string, render?: Function, sortable?: boolean}>} opts.columns
 * @param {object[]} opts.rows
 * @param {Function} [opts.onRowClick]
 * @param {string} [opts.sortKey]
 * @param {boolean} [opts.sortDesc]
 * @param {Function} [opts.onSort]
 * @param {Function} [opts.rowClass]
 * @returns {HTMLElement}
 */
export function DataTable({ columns, rows, onRowClick, sortKey, sortDesc, onSort, rowClass }) {
  const thead = h('thead', {}, [
    h('tr', {}, columns.map(col => {
      const isSorted = sortKey === col.key;
      const arrow = isSorted ? (sortDesc ? ' ↓' : ' ↑') : '';
      return h('th', {
        style: col.width ? { width: col.width } : undefined,
        onClick: col.sortable && onSort ? () => onSort(col.key) : undefined,
        className: col.sortable ? 'cursor-pointer' : '',
      }, [col.label + arrow]);
    })),
  ]);

  const tbody = h('tbody', {}, rows.map(row => {
    const tr = h('tr', {
      className: rowClass ? rowClass(row) : '',
      onClick: onRowClick ? () => onRowClick(row) : undefined,
    }, columns.map(col => {
      const val = col.render ? col.render(row[col.key], row) : (row[col.key] ?? '-');
      return h('td', {}, [typeof val === 'string' ? val : val]);
    }));
    return tr;
  }));

  return h('div', { className: 'table-wrap' }, [
    h('table', { className: 'table' }, [thead, tbody]),
  ]);
}

/**
 * Create a simple key-value table.
 * @param {Array<{label: string, value: any, render?: Function}>} rows
 * @returns {HTMLElement}
 */
export function KeyValueTable(rows) {
  return h('div', { className: 'table-wrap' }, [
    h('table', { className: 'table' }, [
      h('tbody', {}, rows.map(r =>
        h('tr', {}, [
          h('td', { className: 'cell-muted', style: { width: '40%' } }, [r.label]),
          h('td', {}, [r.render ? r.render(r.value) : String(r.value ?? '-')]),
        ])
      )),
    ]),
  ]);
}
