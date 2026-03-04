"use client";

import useSWR from "swr";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch");
  }
  return response.json();
};

export function useLiveData<T>(url: string, refreshInterval = 10000) {
  return useSWR<T>(url, fetcher, {
    refreshInterval,
    revalidateOnFocus: true
  });
}
