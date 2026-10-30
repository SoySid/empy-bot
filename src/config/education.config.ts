import { ProfessionType } from "./economy.config.js";

export interface ExamQuestion {
  id: string;
  question: string;
  options: {
    A: string;
    B: string;
    C: string;
  };
  correctOption: "A" | "B" | "C";
  explanation: string;
}

export interface ProfessionEducation {
  profession: ProfessionType;
  facultyName: string; // ej: "Facultad de Ingeniería Mecánica (UTN)"
  technicalCourse: {
    id: string;
    name: string; // ej: "Curso Superior de Inyección Electrónica"
    certificateItem: string; // id de ítem para inventario
    cost: number;
    buff: {
      earningsBonusPercent: number;
      foodDiscountPercent: number; // 20% en morfi
    };
    questions: ExamQuestion[];
  };
  universityDegree: {
    id: string;
    titleName: string; // Título que se asigna en el perfil
    diplomaItem: string; // id de ítem para inventario
    stages: {
      stageNumber: number;
      name: string; // ej: "1. Ciclo Básico Común (Física Aplicada)", "2. Cursada Troncal", "3. Defensa de Tesis"
      cost: number;
      questions: ExamQuestion[];
    }[];
    buff: {
      earningsBonusPercent: number;
      hungerReductionPercent: number;
      toolsDiscountPercent: number; // 15% en herramientas
    };
  };
}

export const EDUCATION_CONFIG: Record<ProfessionType, ProfessionEducation> = {
  mecanico: {
    profession: "mecanico",
    facultyName: "Facultad Regional de Ingeniería Automotriz (UTN)",
    technicalCourse: {
      id: "curso_mecanico",
      name: "Tecnicatura Superior en Inyección Electrónica y Diagnóstico",
      certificateItem: "cert_mecanico",
      cost: 3500,
      buff: { earningsBonusPercent: 12, foodDiscountPercent: 20 },
      questions: [
        {
          id: "mec_tec_1",
          question: "¿Cuál es la función del sensor sonda Lambda (sensor de oxígeno) en el escape?",
          options: {
            A: "Monitorear la mezcla de aire/combustible para que la ECU ajuste la inyección.",
            B: "Acelerar la salida de los gases para aumentar la velocidad punta.",
            C: "Refrigerar el caño de escape cuando el motor supera los 90 grados.",
          },
          correctOption: "A",
          explanation: "La sonda Lambda mide la cantidad de oxígeno en los gases para mantener la mezcla estequiométrica.",
        },
        {
          id: "mec_tec_2",
          question: "¿Qué síntoma indica típicamente una falla en las pastillas de freno gastadas al disco?",
          options: {
            A: "Chirrido o roce metálico al frenar y pedal esponjoso con menor respuesta.",
            B: "El motor se apaga repentinamente al poner marcha atrás.",
            C: "El velocímetro marca el doble de la velocidad real.",
          },
          correctOption: "A",
          explanation: "El desgaste llega al testigo metálico o al soporte produciendo un chirrido característico.",
        },
      ],
    },
    universityDegree: {
      id: "grado_mecanico",
      titleName: "Ingeniero Mecánico",
      diplomaItem: "diploma_mecanico",
      buff: { earningsBonusPercent: 25, hungerReductionPercent: 20, toolsDiscountPercent: 15 },
      stages: [
        {
          stageNumber: 1,
          name: "1. Ciclo Básico: Termodinámica & Ciclos Térmicos",
          cost: 4000,
          questions: [
            {
              id: "mec_uni_1",
              question: "¿Cuál es la diferencia fundamental entre el ciclo Otto (nafta) y el ciclo Diésel?",
              options: {
                A: "El ciclo Otto usa bujía para chispa y el Diésel enciende por compresión de aire caliente.",
                B: "El ciclo Diésel no utiliza pistones ni bielas, funciona por turbina de vapor.",
                C: "El ciclo Otto funciona exclusivamente con aceite de cocina.",
              },
              correctOption: "A",
              explanation: "El motor diésel comprime el aire hasta elevar su temperatura y autoencender el gasoil.",
            },
          ],
        },
        {
          stageNumber: 2,
          name: "2. Cursada Troncal: Transmisiones & Dinámica Vehicular",
          cost: 4000,
          questions: [
            {
              id: "mec_uni_2",
              question: "¿Para qué sirve el diferencial en el eje de tracción de un automóvil?",
              options: {
                A: "Permite que la rueda interior y exterior de una curva giren a distinta velocidad sin arrastre.",
                B: "Desconecta los frenos delanteros cuando se activa el freno de mano.",
                C: "Sincroniza la música de la radio con las revoluciones del motor.",
              },
              correctOption: "A",
              explanation: "En una curva la rueda exterior recorre más distancia que la interior; el diferencial lo compensa.",
            },
          ],
        },
        {
          stageNumber: 3,
          name: "3. Tesis Final: Optimización de Motores de Alta Eficiencia",
          cost: 4000,
          questions: [
            {
              id: "mec_uni_3",
              question: "¿Qué efecto produce el turbocompresor al forzar más aire en la cámara de combustión?",
              options: {
                A: "Mayor densidad de oxígeno, permitiendo quemar más combustible y aumentar la potencia.",
                B: "Disminuye la compresión para que el motor ande en tres cilindros.",
                C: "Enfría el radiador de agua usando el calor de los gases de escape.",
              },
              correctOption: "A",
              explanation: "Al ingresar aire comprimido más denso, se incrementa la masa de oxígeno y la potencia efectiva.",
            },
          ],
        },
      ],
    },
  },

  enfermero: {
    profession: "enfermero",
    facultyName: "Escuela Superior de Enfermería & Ciencias Médicas (UBA)",
    technicalCourse: {
      id: "curso_enfermero",
      name: "Diplomatura en Farmacología Clínica & Vacunación",
      certificateItem: "cert_enfermero",
      cost: 3500,
      buff: { earningsBonusPercent: 12, foodDiscountPercent: 20 },
      questions: [
        {
          id: "enf_tec_1",
          question: "¿Cuál es el ángulo correcto de inserción para una inyección intramuscular en el glúteo?",
          options: {
            A: "90 grados perpendicular a la superficie de la piel.",
            B: "15 grados paralelo a la dermis superficial.",
            C: "45 grados en dirección oblicua hacia la rodilla.",
          },
          correctOption: "A",
          explanation: "La vía intramuscular profunda en glúteo o deltoides se aplica a 90°.",
        },
      ],
    },
    universityDegree: {
      id: "grado_enfermero",
      titleName: "Licenciado en Enfermería",
      diplomaItem: "diploma_enfermero",
      buff: { earningsBonusPercent: 25, hungerReductionPercent: 20, toolsDiscountPercent: 15 },
      stages: [
        {
          stageNumber: 1,
          name: "1. Ciclo Básico: Fisiología Humana & Signos Vitales",
          cost: 4000,
          questions: [
            {
              id: "enf_uni_1",
              question: "¿Qué rango de frecuencia cardíaca en reposo se considera normal en un adulto (normocadia)?",
              options: {
                A: "Entre 60 y 100 latidos por minuto.",
                B: "Entre 25 y 40 latidos por minuto.",
                C: "Entre 140 y 180 latidos por minuto.",
              },
              correctOption: "A",
              explanation: "El pulso basal habitual en adultos sanos oscila entre 60 y 100 lpm.",
            },
          ],
        },
        {
          stageNumber: 2,
          name: "2. Cursada Troncal: Cuidados Críticos & Shock Hipovolémico",
          cost: 4000,
          questions: [
            {
              id: "enf_uni_2",
              question: "¿Cuál es la primera intervención ante un paciente descompensado por hemorragia aguda severa?",
              options: {
                A: "Compresión directa firme sobre la herida e inicio de fluidoterapia con cristaloides.",
                B: "Indicarle que camine en círculos para activar la circulación periférica.",
                C: "Suministrarle un vaso con agua fría y azúcar por vía oral.",
              },
              correctOption: "A",
              explanation: "El control hemostático y la reposición de volumen intravascular son prioritarios.",
            },
          ],
        },
        {
          stageNumber: 3,
          name: "3. Tesis Final: Gestión de Terapia Intensiva & Bioseguridad",
          cost: 4000,
          questions: [
            {
              id: "enf_uni_3",
              question: "¿Cuál es el 'gold standard' indiscutible para prevenir infecciones intrahospitalarias cruzadas?",
              options: {
                A: "El lavado de manos correcto con agua y jabón o fricción con alcohol en los 5 momentos clave.",
                B: "Encender ventiladores de techo en las salas de aislamiento.",
                C: "Rociar desodorante de ambientes cada 2 horas en los pasillos.",
              },
              correctOption: "A",
              explanation: "La higiene de manos según pautas de la OMS es la medida de mayor impacto comprobado.",
            },
          ],
        },
      ],
    },
  },

  programador: {
    profession: "programador",
    facultyName: "Facultad de Ciencias Exactas & Computación (UBA / Exactas)",
    technicalCourse: {
      id: "curso_programador",
      name: "Certificación Fullstack Cloud & Docker DevOps",
      certificateItem: "cert_programador",
      cost: 3500,
      buff: { earningsBonusPercent: 12, foodDiscountPercent: 20 },
      questions: [
        {
          id: "prog_tec_1",
          question: "¿Para qué sirve un archivo Dockerfile en un entorno de microservicios?",
          options: {
            A: "Define los pasos para construir una imagen inmutable con todas sus dependencias y runtime.",
            B: "Es una base de datos relacional para guardar contraseñas en texto plano.",
            C: "Sirve para acelerar la velocidad de descarga de la conexión WiFi.",
          },
          correctOption: "A",
          explanation: "El Dockerfile automatiza la creación de contenedores portables y reproducibles.",
        },
      ],
    },
    universityDegree: {
      id: "grado_programador",
      titleName: "Ingeniero de Software",
      diplomaItem: "diploma_programador",
      buff: { earningsBonusPercent: 25, hungerReductionPercent: 20, toolsDiscountPercent: 15 },
      stages: [
        {
          stageNumber: 1,
          name: "1. Ciclo Básico: Algoritmos & Estructuras de Datos",
          cost: 4000,
          questions: [
            {
              id: "prog_uni_1",
              question: "¿Cuál es la complejidad temporal promedio de búsqueda en una tabla Hash bien distribuida?",
              options: {
                A: "O(1) tiempo constante.",
                B: "O(N^2) tiempo cuadrático.",
                C: "O(N!) tiempo factorial.",
              },
              correctOption: "A",
              explanation: "El acceso por clave mediante función hash permite operaciones en tiempo constante O(1).",
            },
          ],
        },
        {
          stageNumber: 2,
          name: "2. Cursada Troncal: Arquitectura de Sistemas Distribuidos",
          cost: 4000,
          questions: [
            {
              id: "prog_uni_2",
              question: "¿Qué postula el Teorema CAP para bases de datos distribuidas?",
              options: {
                A: "En presencia de partición de red (P), solo podés garantizar Consistencia (C) o Disponibilidad (A).",
                B: "Todo sistema debe consumir menos del 50% de CPU en servidores Linux.",
                C: "Los datos en disco se comprimen automáticamente sin pérdida de velocidad.",
              },
              correctOption: "A",
              explanation: "El Teorema CAP demuestra el trade-off inevitable entre Consistencia y Disponibilidad en particiones.",
            },
          ],
        },
        {
          stageNumber: 3,
          name: "3. Tesis Final: Sistemas Tolerantes a Fallos & Concurrencia",
          cost: 4000,
          questions: [
            {
              id: "prog_uni_3",
              question: "¿Qué es una condición de carrera (Race Condition) en programación concurrente?",
              options: {
                A: "Cuando múltiples hilos acceden a memoria compartida y el resultado depende del orden impredecible de ejecución.",
                B: "Un benchmark para medir cuál procesador abre más rápido el navegador.",
                C: "Un bucle infinito provocado por un comando while(true) sin break.",
              },
              correctOption: "A",
              explanation: "Las race conditions ocurren cuando accesos concurrentes no sincronizados mutan estado compartido.",
            },
          ],
        },
      ],
    },
  },

  albanil: {
    profession: "albanil",
    facultyName: "Instituto de Construcciones Civiles & Arquitectura",
    technicalCourse: {
      id: "curso_albanil",
      name: "Técnico en Instalaciones Sanitarias & Estructuras",
      certificateItem: "cert_albanil",
      cost: 3500,
      buff: { earningsBonusPercent: 12, foodDiscountPercent: 20 },
      questions: [
        {
          id: "alb_tec_1",
          question: "¿Qué proporción de pendiente mínima recomendada debe tener una cañería de desagüe cloacal?",
          options: {
            A: "Entre 1:50 y 1:20 (1% a 2% de inclinación por metro).",
            B: "Completamente horizontal a 0% para que el agua no corra rápido.",
            C: "Inclinación vertical de 80 grados en tramos largos.",
          },
          correctOption: "A",
          explanation: "La pendiente de 1 a 2 cm por metro asegura el arrastre de sólidos sin sedimentar.",
        },
      ],
    },
    universityDegree: {
      id: "grado_albanil",
      titleName: "Maestro Mayor de Obras",
      diplomaItem: "diploma_albanil",
      buff: { earningsBonusPercent: 25, hungerReductionPercent: 20, toolsDiscountPercent: 15 },
      stages: [
        {
          stageNumber: 1,
          name: "1. Ciclo Básico: Resistencia de Materiales & Hormigón",
          cost: 4000,
          questions: [
            {
              id: "alb_uni_1",
              question: "¿Cuál es la función principal del acero en las vigas y losas de hormigón armado?",
              options: {
                A: "Soportar los esfuerzos de tracción, ya que el hormigón resiste excelente a la compresión.",
                B: "Evitar que la humedad del piso se evapore hacia el techo.",
                C: "Abaratar el costo del cemento portland y la arena.",
              },
              correctOption: "A",
              explanation: "El hormigón resiste a compresión pero es débil a la tracción; las barras de hierro toman esa tracción.",
            },
          ],
        },
        {
          stageNumber: 2,
          name: "2. Cursada Troncal: Cálculo de Cargas & Cimientos",
          cost: 4000,
          questions: [
            {
              id: "alb_uni_2",
              question: "¿Para qué se realizan las zapatas y pilotines en las bases de una estructura?",
              options: {
                A: "Para transmitir y distribuir las cargas vivas y muertas del edificio al suelo resistente.",
                B: "Para permitir que la casa se mueva libremente con el viento de la tormenta.",
                C: "Para reservar agua de lluvia debajo de las paredes.",
              },
              correctOption: "A",
              explanation: "Las fundaciones trasladan las cargas de la edificación hacia estratos de suelo con capacidad portante.",
            },
          ],
        },
        {
          stageNumber: 3,
          name: "3. Tesis Final: Dirección Ejecutiva de Obras Civiles",
          cost: 4000,
          questions: [
            {
              id: "alb_uni_3",
              question: "¿Qué proceso es fundamental durante los primeros 7 a 14 días posteriores al colado de una losa?",
              options: {
                A: "El curado con regado continuo para evitar fisuras por contracción de fragüe.",
                B: "Pintar la superficie inmediatamente con esmalte sintético.",
                C: "Cargar camiones pesados encima para comprobar si resiste.",
              },
              correctOption: "A",
              explanation: "Mantener el hormigón húmedo (curado) garantiza la hidratación completa del cemento y su resistencia de diseño.",
            },
          ],
        },
      ],
    },
  },

  modelo: {
    profession: "modelo",
    facultyName: "Academia Superior de Alta Costura & Imagen Pública",
    technicalCourse: {
      id: "curso_modelo",
      name: "Técnica en Pasarela Editorial & Lenguaje Corporal",
      certificateItem: "cert_modelo",
      cost: 3500,
      buff: { earningsBonusPercent: 12, foodDiscountPercent: 20 },
      questions: [
        {
          id: "mod_tec_1",
          question: "¿En qué consiste la técnica de 'caminar en línea recta' en una pasarela de alta costura?",
          options: {
            A: "Cruzar suavemente los pies pisando una línea imaginaria con el mentón paralelo al piso.",
            B: "Dar saltos cortos hacia los costados para mostrar las suelas de los zapatos.",
            C: "Mirar permanentemente el piso para no tropezar con las alfombras.",
          },
          correctOption: "A",
          explanation: "La zancada fluida sobre una línea central aporta elegancia y resalta la caída de las prendas.",
        },
      ],
    },
    universityDegree: {
      id: "grado_modelo",
      titleName: "Diseñadora de Imagen & Dirección de Moda",
      diplomaItem: "diploma_modelo",
      buff: { earningsBonusPercent: 25, hungerReductionPercent: 20, toolsDiscountPercent: 15 },
      stages: [
        {
          stageNumber: 1,
          name: "1. Ciclo Básico: Historia del Traje & Colorimetría",
          cost: 4000,
          questions: [
            {
              id: "mod_uni_1",
              question: "¿Qué estudia la colorimetría aplicada en la asesoría de imagen profesional?",
              options: {
                A: "La armonía de tonos fríos y cálidos según el subtono de piel, ojos y cabello.",
                B: "El tiempo que tarda una prenda en desteñirse en el lavarropas.",
                C: "La cantidad de tinta que usa una impresora para imprimir fotos.",
              },
              correctOption: "A",
              explanation: "Determina las paletas estacionales que realzan los rasgos naturales de cada persona.",
            },
          ],
        },
        {
          stageNumber: 2,
          name: "2. Cursada Troncal: Dirección Creativa & Pasarelas Internacionales",
          cost: 4000,
          questions: [
            {
              id: "mod_uni_2",
              question: "¿Qué rol cumple el 'moodboard' en la conceptualización de un desfile o shooting?",
              options: {
                A: "Es el panel visual que reúne referencias de texturas, paleta de color e inspiración temática.",
                B: "Es el contrato de pago de los camarógrafos de backstage.",
                C: "Es el perchero donde se cuelga la ropa sucia tras el desfile.",
              },
              correctOption: "A",
              explanation: "El moodboard alinea la visión artística entre fotógrafos, diseñadores y modelos.",
            },
          ],
        },
        {
          stageNumber: 3,
          name: "3. Tesis Final: Gestión de Marca Personal & Alta Costura",
          cost: 4000,
          questions: [
            {
              id: "mod_uni_3",
              question: "¿Cuál es el requisito indispensable de una casa de modas para ser considerada 'Haute Couture' en París?",
              options: {
                A: "Confeccionar prendas a medida de manera artesanal y contar con atelier permanente en París avalado por la Chambre Syndicale.",
                B: "Tener más de un millón de seguidores en redes sociales.",
                C: "Vender vestidos en liquidación en tiendas departamentales masivas.",
              },
              correctOption: "A",
              explanation: "La denominación Haute Couture está protegida legalmente y exige estrictos estándares artesanales en París.",
            },
          ],
        },
      ],
    },
  },

  preventista: {
    profession: "preventista",
    facultyName: "Facultad de Ciencias Económicas & Comercialización",
    technicalCourse: {
      id: "curso_preventista",
      name: "Técnico en Trade Marketing & Negociación de Puntos de Venta",
      certificateItem: "cert_preventista",
      cost: 3500,
      buff: { earningsBonusPercent: 12, foodDiscountPercent: 20 },
      questions: [
        {
          id: "prev_tec_1",
          question: "¿A qué se llama 'zona caliente' en la disposición de productos en un local comercial?",
          options: {
            A: "Las áreas de mayor circulación natural de clientes, como la línea de cajas y cabeceras de góndola.",
            B: "El sector del depósito donde da el sol de la tarde.",
            C: "La zona del estacionamiento donde paran los camiones de reparto.",
          },
          correctOption: "A",
          explanation: "Las zonas calientes maximizan las compras por impulso debido al alto tráfico de público.",
        },
      ],
    },
    universityDegree: {
      id: "grado_preventista",
      titleName: "Licenciado en Comercialización & Logística",
      diplomaItem: "diploma_preventista",
      buff: { earningsBonusPercent: 25, hungerReductionPercent: 20, toolsDiscountPercent: 15 },
      stages: [
        {
          stageNumber: 1,
          name: "1. Ciclo Básico: Microeconomía & Comportamiento del Consumidor",
          cost: 4000,
          questions: [
            {
              id: "prev_uni_1",
              question: "¿Qué ocurre con la demanda de un bien con elasticidad precio elástica si sube su precio?",
              options: {
                A: "La cantidad demandada cae en una proporción mayor que el aumento del precio.",
                B: "La gente compra exactamente el doble sin importar el valor.",
                C: "El producto desaparece automáticamente del mercado financiero.",
              },
              correctOption: "A",
              explanation: "Los bienes con demanda elástica sufren caídas significativas en volumen ante incrementos de precio.",
            },
          ],
        },
        {
          stageNumber: 2,
          name: "2. Cursada Troncal: Gestión de Canales Mayoristas & Distribución",
          cost: 4000,
          questions: [
            {
              id: "prev_uni_2",
              question: "¿Qué métrica comercial mide el 'sell-in' versus el 'sell-out' en la cadena mayorista?",
              options: {
                A: "Sell-in es la venta del distribuidor al comercio, y sell-out es la venta final del comercio al consumidor.",
                B: "Sell-in son las devoluciones por mercadería vencida y sell-out las facturas impagas.",
                C: "Sell-in son las compras de insumos de oficina y sell-out el sueldo de los choferes.",
              },
              correctOption: "A",
              explanation: "El balance entre sell-in y sell-out previene la sobrecarga de stock en el canal minorista.",
            },
          ],
        },
        {
          stageNumber: 3,
          name: "3. Tesis Final: Estrategia de Expansión Corporativa & Ruteo Logístico",
          cost: 4000,
          questions: [
            {
              id: "prev_uni_3",
              question: "¿Cuál es el objetivo de un software de ruteo dinámico con optimización por ventanas horarias?",
              options: {
                A: "Minimizar kilómetros recorridos y consumo de combustible garantizando entregas a tiempo en cada cliente.",
                B: "Obligar a los preventistas a caminar a pie para ahorrar neumáticos.",
                C: "Aumentar los peajes pagados para deducir impuestos provinciales.",
              },
              correctOption: "A",
              explanation: "La optimización logística reduce los costos de flete e incrementa el nivel de servicio y cumplimiento.",
            },
          ],
        },
      ],
    },
  },

  recepcionista: {
    profession: "recepcionista",
    facultyName: "Escuela Superior de Logística Postal & Administración",
    technicalCourse: {
      id: "curso_recepcionista",
      name: "Técnico en Gestión de Correspondencia & Atención al Ciudadano",
      certificateItem: "cert_recepcionista",
      cost: 3500,
      buff: { earningsBonusPercent: 12, foodDiscountPercent: 20 },
      questions: [
        {
          id: "rec_tec_1",
          question: "¿Qué requisito legal es imprescindible al entregar una carta documento o encomienda con acuse de recibo?",
          options: {
            A: "Verificar el DNI del receptor, registrar fecha, hora y firma ológrafa o digital del acuse.",
            B: "Tomar una foto del domicilio y dejar el sobre tirado en el jardín.",
            C: "Cobrarle propina obligatoria al destinatario para entregar el paquete.",
          },
          correctOption: "A",
          explanation: "El acuse de recibo constituye plena prueba fehaciente de notificación legal ante la ley.",
        },
      ],
    },
    universityDegree: {
      id: "grado_recepcionista",
      titleName: "Licenciado en Administración Pública & Logística Postal",
      diplomaItem: "diploma_recepcionista",
      buff: { earningsBonusPercent: 25, hungerReductionPercent: 20, toolsDiscountPercent: 15 },
      stages: [
        {
          stageNumber: 1,
          name: "1. Ciclo Básico: Derecho Administrativo & Procedimientos",
          cost: 4000,
          questions: [
            {
              id: "rec_uni_1",
              question: "¿Qué principio rige la recepción de expedientes en mesa de entradas según la Ley de Procedimiento Administrativo?",
              options: {
                A: "Principio de informalismo a favor del administrado y celeridad en la tramitación.",
                B: "Rechazar cualquier trámite si la hoja tiene un renglón torcido.",
                C: "Exigir estampillas de oro en cada foja presentada.",
              },
              correctOption: "A",
              explanation: "El principio pro administrado facilita que los ciudadanos ejerzan sus derechos sin trabas formales excesivas.",
            },
          ],
        },
        {
          stageNumber: 2,
          name: "2. Cursada Troncal: Cadena de Suministro Internacional & Aduanas",
          cost: 4000,
          questions: [
            {
              id: "rec_uni_2",
              question: "¿Qué significa que un envío internacional esté sujeto al régimen 'Puerta a Puerta' courier?",
              options: {
                A: "El operador postal realiza la gestión aduanera simplificada y entrega en el domicilio del destinatario.",
                B: "El comprador debe viajar a la frontera a retirar el bulto personalmente.",
                C: "El paquete se abre en la vereda de la embajada del país emisor.",
              },
              correctOption: "A",
              explanation: "El régimen courier simplificado liquida aranceles y canaliza envíos menores de forma directa.",
            },
          ],
        },
        {
          stageNumber: 3,
          name: "3. Tesis Final: Transformación Digital & Centros de Distribución Automatizados",
          cost: 4000,
          questions: [
            {
              id: "rec_uni_3",
              question: "¿Cómo optimizan los clasificadores automáticos cross-docking el flujo de millones de paquetes?",
              options: {
                A: "Escanéan códigos matriciales y redirigen bultos a dársenas de salida sin almacenamiento intermedio prolongado.",
                B: "Apilan todas las cajas en un rincón hasta que alguien pregunte por ellas.",
                C: "Pesan los paquetes a mano con una balanza de carnicería mecánica.",
              },
              correctOption: "A",
              explanation: "El cross-docking agiliza el tránsito de mercadería minimizando los tiempos de permanencia en depósito.",
            },
          ],
        },
      ],
    },
  },

  espia: {
    profession: "espia",
    facultyName: "Escuela Nacional de Inteligencia & Ciberdefensa",
    technicalCourse: {
      id: "curso_espia",
      name: "Especialista en Inteligencia de Fuentes Abiertas (OSINT)",
      certificateItem: "cert_espia",
      cost: 3500,
      buff: { earningsBonusPercent: 12, foodDiscountPercent: 20 },
      questions: [
        {
          id: "esp_tec_1",
          question: "¿Qué tipo de información se analiza principalmente en una investigación OSINT?",
          options: {
            A: "Datos accesibles públicamente en internet, redes sociales, registros públicos y metadatos.",
            B: "Documentos confidenciales robados físicamente de una embajada extranjera.",
            C: "Conversaciones privadas interceptadas mediante micrófonos ocultos.",
          },
          correctOption: "A",
          explanation: "OSINT se basa en la recolección legal y análisis de fuentes abiertas y públicas.",
        },
      ],
    },
    universityDegree: {
      id: "grado_espia",
      titleName: "Oficial Superior de Inteligencia Estratégica",
      diplomaItem: "diploma_espia",
      buff: { earningsBonusPercent: 25, hungerReductionPercent: 20, toolsDiscountPercent: 15 },
      stages: [
        {
          stageNumber: 1,
          name: "1. Ciclo Básico: Análisis de Amenazas & Contrainteligencia",
          cost: 4000,
          questions: [
            {
              id: "esp_uni_1",
              question: "¿Cuál es la regla fundamental de la 'compartimentación' en operaciones encubiertas?",
              options: {
                A: "Cada agente o célula solo conoce la información estrictamente necesaria para su misión (Need-to-Know).",
                B: "Todos los agentes deben publicar sus avances en un grupo de WhatsApp abierto.",
                C: "Guardar todos los expedientes secretos en una única computadora sin clave.",
              },
              correctOption: "A",
              explanation: "La compartimentación minimiza el daño si un integrante de la red es descubierto o comprometido.",
            },
          ],
        },
        {
          stageNumber: 2,
          name: "2. Cursada Troncal: Criptografía Asimétrica & Canales Seguros",
          cost: 4000,
          questions: [
            {
              id: "esp_uni_2",
              question: "¿Cómo garantiza la criptografía de clave pública (asimétrica) la confidencialidad?",
              options: {
                A: "Cualquiera cifra con la clave pública del receptor, pero solo el receptor puede descifrar con su clave privada.",
                B: "Emisor y receptor comparten la misma contraseña escrita en un papel.",
                C: "Invierte las letras del mensaje usando el abecedario al revés.",
              },
              correctOption: "A",
              explanation: "El par clave pública/privada permite comunicar información confidencial sin intercambiar claves secretas previas.",
            },
          ],
        },
        {
          stageNumber: 3,
          name: "3. Tesis Final: Geopolítica & Operaciones de Desinformación",
          cost: 4000,
          questions: [
            {
              id: "esp_uni_3",
              question: "¿Qué distingue a una operación 'false flag' (bandera falsa) en táctica militar y espionaje?",
              options: {
                A: "Una acción encubierta diseñada para que parezca perpetrada por otra entidad o país adversario.",
                B: "Izar una bandera de otro color en el barco para festejar el año nuevo.",
                C: "Rendirse antes de comenzar el combate.",
              },
              correctOption: "A",
              explanation: "Las operaciones de bandera falsa buscan justificar represalias o manipular la opinión pública.",
            },
          ],
        },
      ],
    },
  },

  manicura: {
    profession: "manicura",
    facultyName: "Instituto Superior de Dermocosmética & Escultura Ungueal",
    technicalCourse: {
      id: "curso_manicura",
      name: "Técnica Profesional en Uñas Esculpidas & Soft Gel",
      certificateItem: "cert_manicura",
      cost: 3500,
      buff: { earningsBonusPercent: 12, foodDiscountPercent: 20 },
      questions: [
        {
          id: "man_tec_1",
          question: "¿Por qué es crucial deshidratar y aplicar primer en la uña natural antes del sistema de gel?",
          options: {
            A: "Para eliminar oleosidad y asegurar la adherencia química evitando desprendimientos prematuros.",
            B: "Para que la uña cambie de color automáticamente sin usar esmalte.",
            C: "Para endurecer la piel de los dedos contra el frío.",
          },
          correctOption: "A",
          explanation: "La preparación con deshidratador y primer garantiza que el gel o acrílico no se despegue.",
        },
      ],
    },
    universityDegree: {
      id: "grado_manicura",
      titleName: "Licenciada en Cosmiatría & Estética Ungueal",
      diplomaItem: "diploma_manicura",
      buff: { earningsBonusPercent: 25, hungerReductionPercent: 20, toolsDiscountPercent: 15 },
      stages: [
        {
          stageNumber: 1,
          name: "1. Ciclo Básico: Anatomía de la Lámina Ungueal & Patologías",
          cost: 4000,
          questions: [
            {
              id: "man_uni_1",
              question: "¿Qué conducta profesional debe tomarse ante la presencia de onicomicosis (hongos) evidente en una clienta?",
              options: {
                A: "No aplicar ningún esmalte ni esculpido, derivar al dermatólogo y esterilizar todo el instrumental.",
                B: "Cubrir la uña con acrílico espeso para que no se vea la mancha.",
                C: "Lijar con fuerza la lámina hasta que desaparezca la cutícula.",
              },
              correctOption: "A",
              explanation: "Tapar una micosis con gel agrava la infección; se debe priorizar la salud y derivar al especialista.",
            },
          ],
        },
        {
          stageNumber: 2,
          name: "2. Cursada Troncal: Química de Polímeros & Arquitectura de Estructuras",
          cost: 4000,
          questions: [
            {
              id: "man_uni_2",
              question: "¿Qué punto estructural (ápice o stress area) previene fracturas en uñas largas esculpidas?",
              options: {
                A: "El refuerzo de mayor grosor en la zona media de tensión donde la uña soporta el impacto.",
                B: "Hacer la punta extremadamente fina y filosa como aguja.",
                C: "Pegar varias capas de papel tisú con pegamento instantáneo.",
              },
              correctOption: "A",
              explanation: "El correcto balance del ápice equilibra el peso de la uña evitando roturas dolorosas.",
            },
          ],
        },
        {
          stageNumber: 3,
          name: "3. Tesis Final: Bioseguridad en Cabina & Gestión de Spa de Lujo",
          cost: 4000,
          questions: [
            {
              id: "man_uni_3",
              question: "¿Cuál es el método más seguro y normado para esterilizar instrumental de acero quirúrgico de manicura?",
              options: {
                A: "Autoclave a calor húmedo bajo presión o calor seco (estufa) a 180°C con bolsas testigo.",
                B: "Limpiar las tijeras con un trapito mojado en alcohol medicinal.",
                C: "Dejarlas remojando en agua tibia con jabón blanco 5 minutos.",
              },
              correctOption: "A",
              explanation: "Solo el autoclave o estufa médica certificada destruye esporas y patógenos por completo.",
            },
          ],
        },
      ],
    },
  },

  tatuadora: {
    profession: "tatuadora",
    facultyName: "Escuela Superior de Artes Visuales & Pigmentación Cutánea",
    technicalCourse: {
      id: "curso_tatuadora",
      name: "Técnica en Fineline, Sombras & Calibración de Máquinas",
      certificateItem: "cert_tatuadora",
      cost: 3500,
      buff: { earningsBonusPercent: 12, foodDiscountPercent: 20 },
      questions: [
        {
          id: "tat_tec_1",
          question: "¿Qué profundidad aproximada en la piel debe alcanzar la aguja al tatuar para evitar el 'blowout' (tinta expandida)?",
          options: {
            A: "Entre 1 y 2 milímetros, alcanzando la capa dérmica sin perforar el tejido adiposo hipodérmico.",
            B: "Más de 1 centímetro para llegar al hueso y asegurar fijación.",
            C: "Apenas rozar la superficie externa de la epidermis sin sangrado ni marca.",
          },
          correctOption: "A",
          explanation: "La dermis es la capa estable; si se pasa a hipodermis se genera el efecto blowout donde la tinta se expande.",
        },
      ],
    },
    universityDegree: {
      id: "grado_tatuadora",
      titleName: "Licenciada en Bellas Artes & Modificación Corporal",
      diplomaItem: "diploma_tatuadora",
      buff: { earningsBonusPercent: 25, hungerReductionPercent: 20, toolsDiscountPercent: 15 },
      stages: [
        {
          stageNumber: 1,
          name: "1. Ciclo Básico: Composición Visual & Teoría del Contraste",
          cost: 4000,
          questions: [
            {
              id: "tat_uni_1",
              question: "¿Por qué el 'espacio negativo' (piel limpia sin tatuar) es vital en un diseño de tatuaje grande?",
              options: {
                A: "Otorga luz, legibilidad y permite que el tatuaje no se convierta en una mancha oscura con los años.",
                B: "Para ahorrar tinta y cobrar lo mismo por menos trabajo.",
                C: "Porque a la aguja le cuesta entrar en zonas vacías.",
              },
              correctOption: "A",
              explanation: "El espacio negativo brinda respiración al diseño y garantiza que sea legible durante décadas.",
            },
          ],
        },
        {
          stageNumber: 2,
          name: "2. Cursada Troncal: Bioseguridad Sanitaria & Patógenos en Sangre",
          cost: 4000,
          questions: [
            {
              id: "tat_uni_2",
              question: "¿Cuál es el protocolo estricto ante agujas y cartuchos descartables utilizados?",
              options: {
                A: "Descartar inmediatamente en descartador rígido para residuos biopatogénicos sin reencapuchar.",
                B: "Lavarlos con lavandina para volver a usarlos en el próximo cliente.",
                C: "Tirarlos en la bolsa de basura común de la cocina.",
              },
              correctOption: "A",
              explanation: "Las agujas son de un solo uso absoluto y deben depositarse en descartadores certificados.",
            },
          ],
        },
        {
          stageNumber: 3,
          name: "3. Tesis Final: Retrato Hiperrealista & Cicatrización Avanzada",
          cost: 4000,
          questions: [
            {
              id: "tat_uni_3",
              question: "¿Qué ventaja ofrecen los parches adhesivos dérmicos de poliuretano (second skin) en la curación inicial?",
              options: {
                A: "Protegen de bacterias externas permitiendo que la piel respire y aproveche los fluidos enzimáticos propios para cicatrizar.",
                B: "Evitan que el cliente tenga que bañarse durante 15 días seguidos.",
                C: "Fijan el color con pegamento permanente que no se puede despegar.",
              },
              correctOption: "A",
              explanation: "El film de grado médico crea un ambiente húmedo óptimo que reduce costras y acelera la regeneración.",
            },
          ],
        },
      ],
    },
  },

  macumbero: {
    profession: "macumbero",
    facultyName: "Academia Hermética de Ciencias Ocultas & Teología Umbanda",
    technicalCourse: {
      id: "curso_macumbero",
      name: "Técnico en Herbolaria Mágica & Lectura de Tabaco",
      certificateItem: "cert_macumbero",
      cost: 3500,
      buff: { earningsBonusPercent: 12, foodDiscountPercent: 20 },
      questions: [
        {
          id: "mac_tec_1",
          question: "¿Para qué se utiliza tradicionalmente la ruda macho en los rituales de protección popular?",
          options: {
            A: "Para absorber malas energías, cortar la envidia y neutralizar el mal de ojo.",
            B: "Para condimentar pizzas de muzzarella en el horno de barro.",
            C: "Para ahuyentar cucarachas del zócalo de la cocina.",
          },
          correctOption: "A",
          explanation: "La ruda es una de las hierbas esotéricas más consagradas para protección energética.",
        },
      ],
    },
    universityDegree: {
      id: "grado_macumbero",
      titleName: "Pai Supremo / Doctor en Ciencias Ocultas",
      diplomaItem: "diploma_macumbero",
      buff: { earningsBonusPercent: 25, hungerReductionPercent: 20, toolsDiscountPercent: 20 },
      stages: [
        {
          stageNumber: 1,
          name: "1. Ciclo Básico: Geometría Sagrada, Encrucijadas & Entidades Astrales",
          cost: 4000,
          questions: [
            {
              id: "mac_uni_1",
              question: "¿Qué simboliza el cruce de caminos de cuatro esquinas en las tradiciones espirituales afroamericanas?",
              options: {
                A: "La encrucijada donde convergen las energías del mundo terrenal y el espiritual, dominio de Exú y Pomba Gira.",
                B: "El lugar donde pasa la línea 10 de colectivos a medianoche.",
                C: "La parada fija para vender panchos los sábados.",
              },
              correctOption: "A",
              explanation: "La encrucijada es el portal de paso e intercambio ritual entre los planos.",
            },
          ],
        },
        {
          stageNumber: 2,
          name: "2. Cursada Troncal: Los Siete Principios Herméticos del Kybalion",
          cost: 4000,
          questions: [
            {
              id: "mac_uni_2",
              question: "¿Cuál es la regla fundamental de la correspondencia hermética según el Kybalion?",
              options: {
                A: "'Como es arriba, es abajo; como es abajo, es arriba' para comprender los fenómenos universales.",
                B: "'El que madruga encuentra todo cerrado'.",
                C: "'Todo lo que sube tiene que pagar peaje'.",
              },
              correctOption: "A",
              explanation: "El principio de correspondencia explica la resonancia entre el microcosmos y el macrocosmos.",
            },
          ],
        },
        {
          stageNumber: 3,
          name: "3. Tesis Final: Causalidad Cósmica & Ley de Retorno Karmático",
          cost: 4000,
          questions: [
            {
              id: "mac_uni_3",
              question: "¿Por qué en los amarres y trabajos de retorno se exige sumo cuidado con el 'retorno karmático'?",
              options: {
                A: "Porque cualquier trabajo que intente forzar el libre albedrío ajeno genera consecuencias energéticas en el oficiante.",
                B: "Porque las velas de sebo ensucian el mantel del altar.",
                C: "Porque los clientes nunca pagan la segunda cuota si no vuelve la pareja.",
              },
              correctOption: "A",
              explanation: "La ley de causa y efecto o karma exige conciencia y recaudos protectores en la práctica ritual.",
            },
          ],
        },
      ],
    },
  },

  profesora_especial: {
    profession: "profesora_especial",
    facultyName: "Facultad de Ciencias de la Educación & Neurodesarrollo",
    technicalCourse: {
      id: "curso_profesora_especial",
      name: "Técnico en Sistemas Aumentativos de Comunicación & PECS",
      certificateItem: "cert_profesora_especial",
      cost: 3500,
      buff: { earningsBonusPercent: 12, foodDiscountPercent: 20 },
      questions: [
        {
          id: "prof_tec_1",
          question: "¿Cuál es el propósito primordial del sistema PECS (Picture Exchange Communication System)?",
          options: {
            A: "Permitir que personas sin lenguaje verbal funcional inicien la comunicación mediante el intercambio espontáneo de imágenes.",
            B: "Enseñar a dibujar paisajes realistas con lápices de colores.",
            C: "Reemplazar los libros de texto para que los chicos no lean.",
          },
          correctOption: "A",
          explanation: "PECS promueve la iniciativa comunicativa espontánea e intencional desde la primera fase.",
        },
      ],
    },
    universityDegree: {
      id: "grado_profesora_especial",
      titleName: "Especialista en Inclusión Pedagógica & Neurodesarrollo",
      diplomaItem: "diploma_profesora_especial",
      buff: { earningsBonusPercent: 25, hungerReductionPercent: 20, toolsDiscountPercent: 20 },
      stages: [
        {
          stageNumber: 1,
          name: "1. Ciclo Básico: Diseño Universal para el Aprendizaje (DUA)",
          cost: 4000,
          questions: [
            {
              id: "prof_uni_1",
              question: "¿Qué postula el Diseño Universal para el Aprendizaje (DUA) en el aula inclusiva?",
              options: {
                A: "Diseñar propuestas curriculares flexibles desde el inicio con múltiples formas de representación, expresión y motivación.",
                B: "Exigir que todos los alumnos hagan exactamente la misma tarea al mismo tiempo sin excepciones.",
                C: "Separar a los alumnos con dificultades en una sala aislada del resto.",
              },
              correctOption: "A",
              explanation: "El DUA elimina barreras al aprendizaje ofreciendo múltiples vías de acceso al conocimiento para todos.",
            },
          ],
        },
        {
          stageNumber: 2,
          name: "2. Cursada Troncal: Procesamiento Sensorial & Autorregulación en TEA",
          cost: 4000,
          questions: [
            {
              id: "prof_uni_2",
              question: "¿Cuál es la respuesta pedagógica adecuada ante una crisis de sobrecarga sensorial en un estudiante con autismo?",
              options: {
                A: "Reducir estímulos ambientales (luces, ruidos), ofrecer contención segura y respetar los tiempos de autorregulación.",
                B: "Ponerle penitencia en el rincón y gritarle para que se calme de inmediato.",
                C: "Obligarlo a continuar la tarea frente a toda la clase para que se acostumbre.",
              },
              correctOption: "A",
              explanation: "La desregulación sensorial no es un berrinche conductual; requiere reducción de estímulos y contención.",
            },
          ],
        },
        {
          stageNumber: 3,
          name: "3. Tesis Final: Configuraciones Prácticas de Apoyo & Co-Enseñanza",
          cost: 4000,
          questions: [
            {
              id: "prof_uni_3",
              question: "¿Cuál es el rol central del docente de apoyo a la inclusión (DAI / MAI) en la escuela común?",
              options: {
                A: "Co-enseñar y andamiar las configuraciones de apoyo junto al docente de grado, promoviendo la autonomía del estudiante.",
                B: "Hacerle la tarea al alumno en su cuaderno para que termine rápido.",
                C: "Quedarse en la puerta esperando que termine la hora sin intervenir.",
              },
              correctOption: "A",
              explanation: "La inclusión genuina se basa en co-planificación y mediación para potenciar la autonomía del alumno.",
            },
          ],
        },
      ],
    },
  },
};
