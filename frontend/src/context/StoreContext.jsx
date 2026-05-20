import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../lib/api";

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const { data: stores = [] } = useQuery({
    queryKey: ["stores"],
    queryFn: () => api.get("/stores/").then((r) => r.data),
  });

  return (
    <StoreContext.Provider value={{ stores }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}
