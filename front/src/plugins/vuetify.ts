import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import { createVueI18nAdapter } from 'vuetify/locale/adapters/vue-i18n'
import { useI18n } from 'vue-i18n'
import { i18n, RTL_LOCALES } from '@/i18n'
import { themeTextColors } from '@/utils/colors'

export const vuetify = createVuetify({
  locale: {
    rtl: RTL_LOCALES,
    adapter: createVueI18nAdapter({ i18n, useI18n }),
  },
  icons: { defaultSet: 'mdi' },
  theme: {
    defaultTheme: 'parchment',
    themes: {
      parchment: {
        dark: false,
        colors: {
          background: '#F7F1E3',
          surface: '#FFFBF2',
          'surface-variant': '#EDE4D0',
          primary: '#1F3A5F',
          secondary: '#B08A2E',
          ...themeTextColors('parchment'),
        },
      },
      night: {
        dark: true,
        colors: {
          background: '#12151C',
          surface: '#1B1F29',
          'surface-variant': '#2A2F3B',
          primary: '#8FB8EE',
          secondary: '#D9B45A',
          ...themeTextColors('night'),
        },
      },
    },
  },
  defaults: {
    VCard: { variant: 'flat', rounded: 'lg' },
  },
})
