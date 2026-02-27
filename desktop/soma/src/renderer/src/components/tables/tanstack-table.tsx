import { cn } from "@app/lib/cn";
import { type ColumnDef, flexRender, getCoreRowModel, type RowData, useReactTable } from "@tanstack/react-table";
import type { ReactNode } from "react";

type TanstackTableProps<TData extends RowData> = {
	data: TData[];
	columns: ColumnDef<TData, unknown>[];
	isLoading?: boolean;
	loadingMessage?: ReactNode;
	emptyMessage?: ReactNode;
	className?: string;
	tableClassName?: string;
	getRowId?: (row: TData, index: number) => string;
};

function TanstackTable<TData extends RowData>({
	data,
	columns,
	isLoading = false,
	loadingMessage = "Loading...",
	emptyMessage = "No rows.",
	className,
	tableClassName,
	getRowId,
}: TanstackTableProps<TData>): React.JSX.Element {
	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getRowId,
	});
	const rows = table.getRowModel().rows;
	const columnCount = table.getVisibleLeafColumns().length || columns.length || 1;

	return (
		<div className={cn("overflow-x-auto rounded-lg border border-base-300", className)}>
			<table className={cn("table-zebra table-sm table", tableClassName)}>
				<thead>
					{table.getHeaderGroups().map((headerGroup) => (
						<tr key={headerGroup.id}>
							{headerGroup.headers.map((header) => (
								<th key={header.id}>
									{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
								</th>
							))}
						</tr>
					))}
				</thead>
				<tbody>
					{isLoading ? (
						<tr>
							<td className="text-base-content/70" colSpan={columnCount}>
								{loadingMessage}
							</td>
						</tr>
					) : rows.length === 0 ? (
						<tr>
							<td className="text-base-content/70" colSpan={columnCount}>
								{emptyMessage}
							</td>
						</tr>
					) : (
						rows.map((row) => (
							<tr key={row.id}>
								{row.getVisibleCells().map((cell) => (
									<td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
								))}
							</tr>
						))
					)}
				</tbody>
			</table>
		</div>
	);
}

export { TanstackTable };
