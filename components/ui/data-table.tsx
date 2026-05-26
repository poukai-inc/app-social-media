'use client';

import * as React from 'react';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { cn } from '@/lib/cn';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  className?: string;
  emptyMessage?: React.ReactNode;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  className,
  emptyMessage = 'No results.',
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div
      className={cn(
        'rounded-md border border-[color:var(--hairline)] bg-[color:var(--bg-elevated)] overflow-x-auto',
        className,
      )}
    >
      <table className="w-full caption-bottom text-[length:var(--fs-meta)]">
        <thead className="border-b border-[color:var(--hairline)]">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="hover:bg-[color:var(--surface)]">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="h-10 px-4 text-left align-middle font-medium text-[color:var(--fg-muted)]"
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                data-state={row.getIsSelected() ? 'selected' : undefined}
                className="border-b border-[color:var(--hairline-soft)] transition-colors hover:bg-[color:var(--surface)] data-[state=selected]:bg-[color:var(--surface)]"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="p-4 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={columns.length}
                className="h-24 text-center text-[color:var(--fg-muted)]"
              >
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
