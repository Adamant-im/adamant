<script setup lang="ts">
import { version } from '../../package.json';
</script>

<template>
  <a
    class="nav-version"
    href="https://github.com/Adamant-im/adamant/releases"
    target="_blank"
    rel="noopener noreferrer"
  >v{{ version }}</a>
</template>

<style scoped>
.nav-version {
  display: inline-block;
  margin-left: 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--vp-c-text-3);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 1px 8px;
  line-height: 20px;
  text-decoration: none;
  vertical-align: middle;
  transition: color 0.2s, border-color 0.2s;
}

.nav-version:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}
</style>
