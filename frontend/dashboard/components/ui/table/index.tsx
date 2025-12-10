import { ReactNode } from "react";

// Props for Table
interface TableProps {
  children: ReactNode; // Table content (thead, tbody, etc.)
  className?: string; // Optional className for styling
}

// Props for TableHeader
interface TableHeaderProps {
  children: ReactNode; // Header row(s)
  className?: string; // Optional className for styling
}

// Props for TableBody
interface TableBodyProps {
  children: ReactNode; // Body row(s)
  className?: string; // Optional className for styling
}

// Props for TableRow
interface TableRowProps {
  children: ReactNode; // Cells (th or td)
  className?: string; // Optional className for styling
  onClick?: () => void; // Optional click handler
}

// Props for TableCell
interface TableCellProps {
  children: ReactNode; // Cell content
  isHeader?: boolean; // If true, renders as <th>, otherwise <td>
  className?: string; // Optional className for styling
  colSpan?: number; // Optional colspan attribute
}

// Table Component
const Table = ({ children, className }: TableProps) => {
  return <table className={`w-full ${className}`}>{children}</table>;
};

// TableHeader Component
const TableHeader = ({ children, className }: TableHeaderProps) => {
  return <thead className={className}>{children}</thead>;
};

// TableBody Component
const TableBody = ({ children, className }: TableBodyProps) => {
  return <tbody className={className}>{children}</tbody>;
};

// TableRow Component
const TableRow = ({ children, className, onClick }: TableRowProps) => {
  return (
    <tr className={className} onClick={onClick}>
      {children}
    </tr>
  );
};

// TableCell Component
const TableCell = ({
  children,
  isHeader = false,
  className,
  colSpan,
}: TableCellProps) => {
  const CellTag = isHeader ? "th" : "td";
  return (
    <CellTag className={` ${className}`} colSpan={colSpan}>
      {children}
    </CellTag>
  );
};

export { Table, TableHeader, TableBody, TableRow, TableCell };
