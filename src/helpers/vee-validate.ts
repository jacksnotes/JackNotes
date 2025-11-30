import VeeValidate from 'vee-validate'

VeeValidate.Validator.extend('required', {
  getMessage: field => '此项是必填项',
  validate: value => !!value,
})
