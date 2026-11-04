import { mount } from 'svelte';
import App from './App.svelte';
import '../fonts';
import './theme.css';

mount(App, { target: document.getElementById('app')! });
