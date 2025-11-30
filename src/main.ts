import Vue from 'vue'
import 'tailwindcss/dist/base.css'
import 'tailwindcss/dist/components.css'
import 'tailwindcss/dist/utilities.css'
import moment from 'moment'
import Antd from 'ant-design-vue'
import 'remixicon/fonts/remixicon.css'
import 'katex/dist/katex.min.css'
import '@fontsource/noto-serif/index.css'
import '@/assets/styles/main.less'
import VueI18n from 'vue-i18n'
import Prism from 'prismjs'
import VueShortkey from 'vue-shortkey'
import VeeValidate from 'vee-validate'
import { remote } from 'electron'
// import * as Sentry from '@sentry/electron'
import locale from './assets/locales'
import App from './App.vue'
import router from './router'
import store from './store/index'
import VueBus from './vue-bus'
import ga from './helpers/analytics'
import './helpers/vee-validate'

ga.event('Client', 'show', {
  evLabel: 'startup',
})

// Sentry.init({ dsn: 'https://6a6dacc57a6a4e27a88eb31596c152f8@sentry.io/1887150' })

const defaultLocale = ({
  'zh-CN': 'zhHans',
  'zh-TW': 'zh_TW',
  'en-US': 'en',
} as any)['zh-CN'] // remote.app.getLocale() || 'zh-CN'

Vue.use(VueI18n)
const i18n = new VueI18n({
  locale: localStorage.getItem('language') || defaultLocale,
  messages: locale as any,
  silentTranslationWarn: true,
})

Prism.highlightAll()

Vue.use(Antd)
Vue.use(VeeValidate)
Vue.use(VueBus)
Vue.use(VueShortkey)
Vue.prototype.$moment = moment

Vue.config.productionTip = false

new Vue({
  router,
  store,
  i18n,
  render: h => h(App),
  mounted() {
    router.push('/').catch(() => {})
  },
}).$mount('#app')
