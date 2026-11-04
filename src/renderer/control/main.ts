import { mount } from 'svelte';
import '../fonts';
import '../operator/theme.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
