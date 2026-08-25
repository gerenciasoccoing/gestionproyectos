// Catálogo inicial de entidades de seguridad social colombianas, usado para sembrar
// SocialSecurityProvider tanto en empresas nuevas (companyProvisioningService.js) como para
// empresas ya existentes al desplegar esta funcionalidad (postSyncFixups.js). Es solo el punto de
// partida — cada empresa puede agregar las suyas desde el selector de la ficha del trabajador.
const DEFAULT_SOCIAL_SECURITY_PROVIDERS = {
  eps: ['Sura EPS', 'Sanitas EPS', 'Nueva EPS', 'Compensar EPS', 'Famisanar EPS', 'Salud Total EPS', 'Coosalud EPS', 'Comfenalco Valle EPS'],
  pension: ['Porvenir', 'Protección', 'Colfondos', 'Colpensiones'],
  arl: ['Sura ARL', 'Positiva ARL', 'Colmena Seguros ARL', 'Seguros Bolívar ARL', 'AXA Colpatria ARL'],
};

module.exports = { DEFAULT_SOCIAL_SECURITY_PROVIDERS };
