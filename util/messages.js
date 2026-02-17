import * as ms from "./messages.json";
import { useMemo, useContext } from "react";
import { userContext } from "../context/userContext";

export const useMessage = () => {
  const ctx = useContext(userContext) || {};
  const language = ctx.language || "en";
  const msg = useMemo(() => ms[language] || ms["en"], [language]);
  return msg;
};
