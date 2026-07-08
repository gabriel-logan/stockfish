import axios from "axios";

import { BaseUrlAPI } from "../constants";

const apiInstance = axios.create({
  baseURL: BaseUrlAPI,
  timeout: 10000,
});

export default apiInstance;
