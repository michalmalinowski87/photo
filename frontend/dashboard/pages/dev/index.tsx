"use client";

import React from "react";
import Link from "next/link";
import {
  FlaskConical,
  Plus,
  Trash2,
  Database,
  Settings,
  FileText,
} from "lucide-react";

interface DevTool {
  title: string;
  description: string;
  path: string;
  icon: React.ReactNode;
  category: string;
  color: string;
}

const devTools: DevTool[] = [
  {
    title: "Utwórz galerie testowe",
    description: "Generuj wiele galerii testowych z losowymi zdjęciami okładkowymi",
    path: "/dev/create-test-galleries",
    icon: <Plus size={24} />,
    category: "Galerie",
    color: "blue",
  },
  {
    title: "Usuń galerie według statusu",
    description: "Usuń wszystkie galerie z wybranym statusem (nieopłacone, dostarczone, itp.)",
    path: "/dev/delete-galleries-by-status",
    icon: <Trash2 size={24} />,
    category: "Galerie",
    color: "red",
  },
  {
    title: "Utwórz dane testowe",
    description: "Utwórz 100 pakietów i/lub 100 klientów do testowania",
    path: "/dev/create-test-data",
    icon: <Plus size={24} />,
    category: "Baza",
    color: "green",
  },
  {
    title: "Usuń wszystkie dane",
    description: "Usuń wszystkie pakiety i/lub klientów z bazy danych",
    path: "/dev/delete-all-data",
    icon: <Trash2 size={24} />,
    category: "Baza",
    color: "red",
  },
];

const categoryColors: Record<string, string> = {
  Galerie: "bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200",
  Baza: "bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200",
  API: "bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-200",
  Konfiguracja: "bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200",
};

const iconColors: Record<string, string> = {
  blue: "text-blue-600 dark:text-blue-400",
  red: "text-red-600 dark:text-red-400",
  green: "text-green-600 dark:text-green-400",
  purple: "text-purple-600 dark:text-purple-400",
  yellow: "text-yellow-600 dark:text-yellow-400",
};

export default function DevMenu() {
  const categories = Array.from(new Set(devTools.map((tool) => tool.category)));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
              <FlaskConical className="w-8 h-8 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Menu Deweloperskie
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Narzędzia pomocne w rozwoju i testowaniu aplikacji
              </p>
            </div>
          </div>
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>⚠️ Uwaga:</strong> Te narzędzia są przeznaczone wyłącznie do użytku
              deweloperskiego. Operacje mogą być nieodwracalne.
            </p>
          </div>
        </div>

        {/* Tools by Category */}
        <div className="space-y-8">
          {categories.map((category) => {
            const categoryTools = devTools.filter((tool) => tool.category === category);
            return (
              <div key={category}>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                  {category}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {categoryTools.map((tool) => (
                    <Link
                      key={tool.path}
                      href={tool.path}
                      className="block p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 group"
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className={`p-3 rounded-lg ${categoryColors[tool.category]} group-hover:scale-110 transition-transform`}
                        >
                          <div className={iconColors[tool.color]}>{tool.icon}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                            {tool.title}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                            {tool.description}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}

