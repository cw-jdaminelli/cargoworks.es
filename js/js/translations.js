// ===== CARGOWORKS LANGUAGE PACK =====
// Update the text values inside each language section. Keep the keys the same so the page wiring keeps working.

(function initTranslations(global){
  const translations = {
    en: {
      // --- Navigation ---
      navAbout: "About",
      navServices: "Services",
      navZones: "Zones",

      // --- Hero ---
      caption: "We’re Cargoworks — a crew of riders who know the city by heart. We deliver urgent parcels, meals and supplies with the speed of a local and the care of a neighbor.",

      // --- About / Services ---
      aboutTitle: "About Us",
      aboutText: "We are a reliable and socially conscious bike logistics service in Barcelona. Fast, clean, and human-powered.",
      servicesTitle: "Services",
      servicesList: "<li>Messenger & courier deliveries</li><li>Cargo bike consulting</li><li>Logistics solutions for businesses</li><li>Fleet maintenance & training</li>",
      zonesTitle: "Zone Map & Prices",
      zonesText: "Contact us for details on weight, timing, and weekend deliveries.",

      // --- Hero info blocks ---
      block1Title: "Same-day Deliveries",
      block1Body: "Rapid, reliable cargo-bike courier service across Barcelona's central zones.",
      block2Title: "Sustainable Logistics",
      block2Body: "Low-emission, human-powered deliveries tailored for local businesses. You have a need, we have the toolbox to solve it.",
      block3Title: "Fleet & Consulting",
      block3Body: "Fleet support, consulting and cargo-bike solutions for urban logistics.",

      // --- Sticky cards ---
      card1Title: "Same-day Deliveries",
      card1Body: "Rapid, reliable cargo-bike courier service across Barcelona's central zones.",
      card2Title: "Sustainable Logistics",
      card2Body: "Low-emission, human-powered deliveries tailored for local businesses.",
      card3Title: "Fleet & Consulting",
      card3Body: "Fleet support, consulting and cargo-bike solutions for urban logistics.",
      card4Title: "More Services",
      card4Body: "Fleet maintenance, training and local logistics expertise.",
      scrollDown: "Ride through our services deck",
      scrollUp: "Head back to the overview",

      // --- Footer / Contact ---
      siteExplore: "Explore",
      siteAbout: "About",
      siteServices: "Services",
      siteZones: "Zones",
      siteFaq: "FAQ",
      siteSolutions: "Solutions",
      siteMessenger: "Messenger & courier",
      siteCargo: "Cargo bike consulting",
      siteRoutes: "Route planning",
      siteMaintenance: "Fleet maintenance",
      siteContact: "Contact",
      siteContactBlurb: "Reach our coordinators for bookings, partnerships, or support 7 days a week.",
      siteEmailLabel: "Email",
      sitePhoneLabel: "Phone",
      siteHoursLabel: "Hours",
      siteHoursText: "7:00 - 17:00 Mon-Fri and 7:00 - 15:00 Saturday and Sunday, with the exception of booked jobs.",
      footerInstagram: "Instagram",
      footerCopy: "© 2025 Cargoworks – Bike Logistics Barcelona"
    },
    es: {
      // --- Navegación ---
      navAbout: "Nosotros",
      navServices: "Servicios",
      navZones: "Zonas",

      // --- Hero ---
      caption: "Somos Cargoworks: reparto ágil y cercano en Barcelona, fiable y de bajo impacto — gestionado por gente local que se implica.",

      // --- Sobre / Servicios ---
      aboutTitle: "Sobre Nosotros",
      aboutText: "Somos un servicio de mensajería y logística en bicicleta, fiable y socialmente consciente en Barcelona.",
      servicesTitle: "Servicios",
      servicesList: "<li>Mensajería y repartos</li><li>Consultoría de bicis de carga</li><li>Soluciones logísticas para empresas</li><li>Mantenimiento y formación de flotas</li>",
      zonesTitle: "Mapa de Zonas y Precios",
      zonesText: "Contáctanos para detalles sobre peso, horarios y entregas en fin de semana.",

      // --- Bloques hero ---
      block1Title: "Entregas en el mismo día",
      block1Body: "Servicio rápido y fiable de mensajería en cargo bike por las zonas centrales de Barcelona.",
      block2Title: "Logística sostenible",
      block2Body: "Entregas de bajo impacto, humanas y adaptadas a los negocios locales. Tú pides, nosotros tenemos las herramientas.",
      block3Title: "Flota y consultoría",
      block3Body: "Soporte de flotas, consultoría y soluciones de bicicletas de carga para la logística urbana.",

      // --- Tarjetas sticky ---
      card1Title: "Entregas en el mismo día",
      card1Body: "Servicio rápido y fiable de mensajería en cargo bike por las zonas centrales de Barcelona.",
      card2Title: "Logística sostenible",
      card2Body: "Entregas de bajo impacto, humanas y adaptadas a los negocios locales.",
      card3Title: "Flota y consultoría",
      card3Body: "Soporte de flotas, consultoría y soluciones de bicicletas de carga para la logística urbana.",
      card4Title: "Más servicios",
      card4Body: "Mantenimiento de flotas, formación y experiencia logística local.",
      scrollDown: "Recorre nuestro bloque de servicios",
      scrollUp: "Vuelve al resumen",

      // --- Footer / Contacto ---
      siteExplore: "Descubre",
      siteAbout: "Nosotros",
      siteServices: "Servicios",
      siteZones: "Zonas",
      siteFaq: "Preguntas frecuentes",
      siteSolutions: "Soluciones",
      siteMessenger: "Mensajería y courier",
      siteCargo: "Consultoría en cargo bike",
      siteRoutes: "Planificación de rutas",
      siteMaintenance: "Mantenimiento de flotas",
      siteContact: "Contacto",
      siteContactBlurb: "Habla con nuestro equipo para reservas, colaboraciones o soporte los 7 días de la semana.",
      siteEmailLabel: "Correo",
      sitePhoneLabel: "Teléfono",
      siteHoursLabel: "Horario",
      siteHoursText: "7:00 - 17:00 de lunes a viernes y 7:00 - 15:00 sábados y domingos, salvo trabajos reservados.",
      footerInstagram: "Instagram",
      footerCopy: "© 2025 Cargoworks – Logística en bicicleta Barcelona"
    },
    ca: {
      // --- Navegació ---
      navAbout: "Nosaltres",
      navServices: "Serveis",
      navZones: "Zones",

      // --- Hero ---
      caption: "Som Cargoworks: repartiment ràpid i proper a Barcelona, fiable i de baix impacte — fet per gent local que s'hi deixa la pell.",

      // --- Sobre / Serveis ---
      aboutTitle: "Sobre Nosaltres",
      aboutText: "Som un servei de missatgeria i logística en bicicleta, fiable i amb consciència social a Barcelona.",
      servicesTitle: "Serveis",
      servicesList: "<li>Missatgeria i repartiments</li><li>Consultoria de bicis de càrrega</li><li>Solucions logístiques per a empreses</li><li>Manteniment i formació de flotes</li>",
      zonesTitle: "Mapa de Zones i Preus",
      zonesText: "Contacta amb nosaltres per a detalls de pes, horaris i entregues en cap de setmana.",

      // --- Blocs hero ---
      block1Title: "Entregues en el mateix dia",
      block1Body: "Servei ràpid i fiable de missatgeria amb bicicletes de càrrega pels barris centrals de Barcelona.",
      block2Title: "Logística sostenible",
      block2Body: "Entregues de baix impacte, impulsades per persones, pensades per als negocis locals. Tu tens la necessitat, nosaltres les eines.",
      block3Title: "Flota i consultoria",
      block3Body: "Suport de flota, consultoria i solucions de bicicletes de càrrega per a la logística urbana.",

      // --- Targetes sticky ---
      card1Title: "Entregues en el mateix dia",
      card1Body: "Servei ràpid i fiable de missatgeria amb bicicletes de càrrega pels barris centrals de Barcelona.",
      card2Title: "Logística sostenible",
      card2Body: "Entregues de baix impacte, pensades per als negocis locals.",
      card3Title: "Flota i consultoria",
      card3Body: "Suport de flota, consultoria i solucions de bicicletes de càrrega per a la logística urbana.",
      card4Title: "Més serveis",
      card4Body: "Manteniment de flotes, formació i experiència logística local.",
      scrollDown: "Recorre el nostre bloc de serveis",
      scrollUp: "Torna al resum",

      // --- Peu / Contacte ---
      siteExplore: "Explora",
      siteAbout: "Nosaltres",
      siteServices: "Serveis",
      siteZones: "Zones",
      siteFaq: "Preguntes freqüents",
      siteSolutions: "Solucions",
      siteMessenger: "Missatgeria i courier",
      siteCargo: "Consultoria en cargo bike",
      siteRoutes: "Planificació de rutes",
      siteMaintenance: "Manteniment de flotes",
      siteContact: "Contacte",
      siteContactBlurb: "Parla amb el nostre equip per reserves, aliances o suport cada dia de la setmana.",
      siteEmailLabel: "Correu",
      sitePhoneLabel: "Telèfon",
      siteHoursLabel: "Horari",
      siteHoursText: "7:00 - 17:00 de dilluns a divendres i 7:00 - 15:00 dissabtes i diumenges, excepte serveis reservats.",
      footerInstagram: "Instagram",
      footerCopy: "© 2025 Cargoworks – Logística amb bicicleta a Barcelona"
    },
    pt: {
      // --- Navegação ---
      navAbout: "Sobre",
      navServices: "Serviços",
      navZones: "Zonas",

      // --- Hero ---
      caption: "Somos CARGOWORKS: entregas rápidas e próximas em Barcelona, confiáveis e de baixo impacto — feitas por gente local que se importa.",

      // --- Sobre / Serviços ---
      aboutTitle: "Sobre Nós",
      aboutText: "Somos um serviço de logística em bicicleta confiável e consciente em Barcelona. Rápido, limpo e humano.",
      servicesTitle: "Serviços",
      servicesList: "<li>Mensageiro e entregas urgentes</li><li>Consultoria de bicicletas de carga</li><li>Soluções logísticas para empresas</li><li>Manutenção e formação de frotas</li>",
      zonesTitle: "Mapa de Zonas e Preços",
      zonesText: "Fale connosco para detalhes sobre peso, horários e entregas ao fim de semana.",

      // --- Blocos hero ---
      block1Title: "Entregas no mesmo dia",
      block1Body: "Serviço rápido e confiável de couriers com cargo-bike pelos bairros centrais de Barcelona.",
      block2Title: "Logística sustentável",
      block2Body: "Entregas de baixo impacto, feitas por pessoas, sob medida para negócios locais. Você precisa, nós temos as ferramentas.",
      block3Title: "Frota e consultoria",
      block3Body: "Suporte de frota, consultoria e soluções de bicicletas de carga para logística urbana.",

      // --- Cartas sticky ---
      card1Title: "Entregas no mesmo dia",
      card1Body: "Serviço rápido e confiável de couriers com cargo-bike pelos bairros centrais de Barcelona.",
      card2Title: "Logística sustentável",
      card2Body: "Entregas de baixo impacto feitas por gente local.",
      card3Title: "Frota e consultoria",
      card3Body: "Suporte de frota, consultoria e soluções de bicicletas de carga para logística urbana.",
      card4Title: "Mais serviços",
      card4Body: "Manutenção de frotas, formação e experiência logística local.",
      scrollDown: "Percorra o nosso deck de serviços",
      scrollUp: "Volte ao panorama geral",

      // --- Rodapé / Contato ---
      siteExplore: "Explorar",
      siteAbout: "Sobre",
      siteServices: "Serviços",
      siteZones: "Zonas",
      siteFaq: "FAQ",
      siteSolutions: "Soluções",
      siteMessenger: "Mensageiro e courier",
      siteCargo: "Consultoria cargo bike",
      siteRoutes: "Planejamento de rotas",
      siteMaintenance: "Manutenção de frotas",
      siteContact: "Contato",
      siteContactBlurb: "Fale com nossa coordenação para reservas, parcerias ou suporte todos os dias.",
      siteEmailLabel: "Email",
      sitePhoneLabel: "Telefone",
      siteHoursLabel: "Horário",
      siteHoursText: "7:00 - 17:00 de segunda a sexta e 7:00 - 15:00 sábado e domingo, salvo trabalhos agendados.",
      footerInstagram: "Instagram",
      footerCopy: "© 2025 Cargoworks – Logística de bicicletas em Barcelona"
    }
  };

  global.CARGOWORKS_TRANSLATIONS = translations;
})(window);
