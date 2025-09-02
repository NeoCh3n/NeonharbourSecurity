import type { StorybookConfig } from "@storybook/react";
const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|ts|tsx)"],
  addons: ["@storybook/addon-essentials"],
  framework: {
    name: "@storybook/react",
    options: {}
  },
  docs: {
    autodocs: "tag"
  }
};
export default config;

