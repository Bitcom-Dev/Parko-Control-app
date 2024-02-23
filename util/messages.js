import * as ms from "./messages.json";
import { useMemo, useContext } from "react";
import { userContext } from "../context/userContext";

export const useMessage = () => {
  const { language } = useContext(userContext);
  const msg = useMemo(() => ms[language], [language]);
  return msg;
};
