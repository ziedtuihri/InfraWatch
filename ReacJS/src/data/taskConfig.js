// src/data/taskConfig.js

export const TOOL_TASK_MAPPING = {
  prometheus: {
    id: 1,
    name: "Prometheus Execution",
    description: "Triggers the Prometheus data collection task"
  },
  // Add other tools and custom variables here
  customVars: {
    defaultTimeout: 300,
    retryCount: 3
  }
};
