import { useState, useEffect } from "react";

interface UsePaginationProps {
  totalItems: number;
  initialPage?: number;
  initialItemsPerPage?: number;
  storageKey?: string; // Key for localStorage persistence
}

export const usePagination = ({
  totalItems,
  initialPage = 1,
  initialItemsPerPage = 10,
  storageKey = "table-pagination-limit",
}: UsePaginationProps) => {
  // Initialize items per page from localStorage or default
  const [itemsPerPage, setItemsPerPage] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        return parseInt(saved, 10);
      }
    }
    return initialItemsPerPage;
  });

  // Initialize current page
  const [currentPage, setCurrentPage] = useState(initialPage);

  // Update localStorage when itemsPerPage changes
  useEffect(() => {
    localStorage.setItem(storageKey, itemsPerPage.toString());
  }, [itemsPerPage, storageKey]);

  // Reset to first page if itemsPerPage changes or totalItems changes significantly
  // (Optional: depending on UX preference, but usually good to reset if current page > total pages)
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [totalItems, itemsPerPage, totalPages, currentPage]);

  const handlePageChange = (page: number) => {
    const validPage = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(validPage);
  };

  const handleItemsPerPageChange = (value: number) => {
    setItemsPerPage(value);
    setCurrentPage(1); // Reset to first page when changing limit
  };

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);

  return {
    currentPage,
    itemsPerPage,
    totalPages,
    startIndex,
    endIndex,
    handlePageChange,
    handleItemsPerPageChange,
  };
};
