import React from "react";

interface StatisticsCardProps {
  title: string;
  value: string | number;
}

export const StatisticsCard = ({ title, value }: StatisticsCardProps) => {
  return (
    <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 flex flex-col">
      <div className="h-12 mb-4 text-md font-medium text-gray-600 dark:text-gray-400 leading-tight flex items-start">
        {title}
      </div>
      <div className="text-4xl font-bold text-gray-900 dark:text-white mt-auto">{value}</div>
    </div>
  );
};
