import axios from "axios";

import { baseUrlEngine } from "../constants";

const engineInstance = axios.create({
  baseURL: baseUrlEngine,
  timeout: 10000,
});

export default engineInstance;
