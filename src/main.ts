import { createApp } from 'vue';

import App from '@/App.vue';
import { pinia } from '@/store';

import '@/index.css';

const app = createApp(App);

// Подключаем Pinia
app.use(pinia);

// Монтируем приложение
app.mount('#root');

