import { createApp } from 'vue';

import App from '@/App.vue';
import '@/index.css';
import { pinia } from '@/store';

const app = createApp(App);

// Подключаем Pinia
app.use(pinia);

// Монтируем приложение
app.mount('#root');
