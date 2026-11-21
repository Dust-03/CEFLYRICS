import { mount } from 'svelte';
import App from './App.svelte';
import '../fonts';
// Fuentes de la consola (OFL): Atkinson para la interfaz, Literata para versículos y letras.
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
import '@fontsource-variable/literata/wght.css';
import './theme.css';

mount(App, { target: document.getElementById('app')! });
