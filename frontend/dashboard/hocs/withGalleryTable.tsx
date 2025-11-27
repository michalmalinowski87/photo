import React, { ComponentType, useMemo, useState, useCallback } from "react";
import { useUIStore } from "../store/uiSlice";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../components/ui/table";

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

interface TableConfig<T> {
  tableId: string;
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  defaultSort?: {
    key: string;
    order: "asc" | "desc";
  };
}

interface WithGalleryTableProps<T> {
  renderTable?: (config: TableConfig<T>) => React.ReactNode;
}

/**
 * HOC that provides unified table rendering with persistent preferences
 */
export function withGalleryTable<P extends object, T = any>(
  WrappedComponent: ComponentType<P & WithGalleryTableProps<T>>
) {
  return function GalleryTableComponent(props: P) {
    const { tablePreferences, setTablePreferences } = useUIStore();

    const renderTable = useCallback(
      (config: TableConfig<T>) => {
        const {
          tableId,
          data,
          columns,
          keyExtractor,
          emptyMessage = "Brak danych do wyświetlenia",
          onRowClick,
          defaultSort,
        } = config;

        const preferences = tablePreferences[tableId] || {};
        const [localSort, setLocalSort] = useState<{
          key: string;
          order: "asc" | "desc";
        } | null>(
          preferences.sortBy && preferences.sortOrder
            ? { key: preferences.sortBy, order: preferences.sortOrder }
            : defaultSort || null
        );

        const sortedData = useMemo(() => {
          if (!localSort) return data;

          const column = columns.find((col) => col.key === localSort.key);
          if (!column || !column.sortable) return data;

          return [...data].sort((a, b) => {
            const aValue = column.render ? String(column.render(a)) : (a as any)[localSort.key];
            const bValue = column.render ? String(column.render(b)) : (b as any)[localSort.key];

            if (aValue < bValue) return localSort.order === "asc" ? -1 : 1;
            if (aValue > bValue) return localSort.order === "asc" ? 1 : -1;
            return 0;
          });
        }, [data, localSort, columns]);

        const handleSort = useCallback(
          (key: string) => {
            const column = columns.find((col) => col.key === key);
            if (!column || !column.sortable) return;

            const newOrder: "desc" | "asc" =
              localSort?.key === key && localSort.order === "asc" ? "desc" : "asc";
            const newSort = { key, order: newOrder };
            setLocalSort(newSort);
            setTablePreferences(tableId, {
              ...preferences,
              sortBy: key,
              sortOrder: newOrder,
            });
          },
          [columns, localSort, tableId, preferences, setTablePreferences]
        );

        return (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 dark:bg-gray-900">
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      isHeader
                      className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400 ${
                        column.className || ""
                      }`}
                    >
                      {column.sortable ? (
                        <button
                          onClick={() => handleSort(column.key)}
                          className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                          {column.header}
                          {localSort?.key === column.key && (
                            <span className="text-gray-400">
                              {localSort.order === "asc" ? "↑" : "↓"}
                            </span>
                          )}
                        </button>
                      ) : (
                        column.header
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                    >
                      {emptyMessage}
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedData.map((item) => (
                    <TableRow
                      key={keyExtractor(item)}
                      onClick={() => onRowClick?.(item)}
                      className={
                        onRowClick ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" : ""
                      }
                    >
                      {columns.map((column) => (
                        <TableCell
                          key={column.key}
                          className={`px-4 py-3 text-sm ${column.className || ""}`}
                        >
                          {column.render ? column.render(item) : (item as any)[column.key]}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        );
      },
      [tablePreferences, setTablePreferences]
    );

    return <WrappedComponent {...(props as P)} renderTable={renderTable} />;
  };
}

/**
 * Hook version for direct use in components
 */
export function useGalleryTable<T>(config: TableConfig<T>) {
  const { tablePreferences, setTablePreferences } = useUIStore();
  const preferences = tablePreferences[config.tableId] || {};
  const [localSort, setLocalSort] = useState<{
    key: string;
    order: "asc" | "desc";
  } | null>(
    preferences.sortBy && preferences.sortOrder
      ? { key: preferences.sortBy, order: preferences.sortOrder }
      : config.defaultSort || null
  );

  const sortedData = useMemo(() => {
    if (!localSort) return config.data;

    const column = config.columns.find((col) => col.key === localSort.key);
    if (!column || !column.sortable) return config.data;

    return [...config.data].sort((a, b) => {
      const aValue = column.render ? String(column.render(a)) : (a as any)[localSort.key];
      const bValue = column.render ? String(column.render(b)) : (b as any)[localSort.key];

      if (aValue < bValue) return localSort.order === "asc" ? -1 : 1;
      if (aValue > bValue) return localSort.order === "asc" ? 1 : -1;
      return 0;
    });
  }, [config.data, localSort, config.columns]);

  const handleSort = useCallback(
    (key: string) => {
      const column = config.columns.find((col) => col.key === key);
      if (!column || !column.sortable) return;

      const newOrder: "desc" | "asc" =
        localSort?.key === key && localSort.order === "asc" ? "desc" : "asc";
      const newSort = { key, order: newOrder };
      setLocalSort(newSort);
      setTablePreferences(config.tableId, {
        ...preferences,
        sortBy: key,
        sortOrder: newOrder,
      });
    },
    [config.columns, localSort, config.tableId, preferences, setTablePreferences]
  );

  return {
    sortedData,
    handleSort,
    currentSort: localSort,
  };
}
