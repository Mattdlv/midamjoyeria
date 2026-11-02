/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    /** Mail de quien entró al panel. Solo existe en rutas de /admin ya autorizadas. */
    usuario?: string;
  }
}
