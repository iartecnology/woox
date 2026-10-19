-- ====================================================================
-- AUTO-PROVISIONING DE FLUJO IA OMNICANAL PARA NUEVOS COMERCIOS
-- Cada vez que se crea un comercio en Woox, se le genera automáticamente
-- un flujo visual completo con IA y captura de órdenes para evitar errores.
-- ====================================================================

CREATE OR REPLACE FUNCTION auto_generate_default_bot_flow()
RETURNS TRIGGER AS $$
DECLARE
  v_flow_data JSONB;
BEGIN
  -- Construir el flow_data estándar con IA + Búsqueda de Catálogo + Carrito + Checkout
  v_flow_data := jsonb_build_object(
    'nodes', jsonb_build_array(
      jsonb_build_object(
        'id', 'node_start',
        'type', 'start',
        'position', jsonb_build_object('x', 300, 'y', 50),
        'data', jsonb_build_object(
          'label', 'Inicio',
          'message', '¡Hola! 👋 Bienvenidos a ' || COALESCE(NEW.name, 'nuestra tienda') || '. ¿En qué te podemos ayudar hoy?'
        )
      ),
      jsonb_build_object(
        'id', 'node_agent',
        'type', 'ai_agent',
        'position', jsonb_build_object('x', 450, 'y', 200),
        'data', jsonb_build_object(
          'label', 'Asesor de Ventas IA',
          'prompt', 'Eres el asesor comercial de ' || COALESCE(NEW.name, 'este comercio') || '. Recomienda productos amablemente según nuestro catálogo, resuelve dudas y usa add_to_cart al confirmar un producto. Al finalizar, ejecuta checkout_trigger.',
          'temperature', 0.5
        )
      ),
      jsonb_build_object(
        'id', 'node_skill_search',
        'type', 'skill',
        'position', jsonb_build_object('x', 200, 'y', 200),
        'data', jsonb_build_object(
          'label', 'Buscar Catálogo',
          'skillType', 'catalog_search'
        )
      ),
      jsonb_build_object(
        'id', 'node_skill_cart',
        'type', 'skill',
        'position', jsonb_build_object('x', 200, 'y', 270),
        'data', jsonb_build_object(
          'label', 'Agregar al Carrito',
          'skillType', 'add_to_cart'
        )
      ),
      jsonb_build_object(
        'id', 'node_skill_checkout',
        'type', 'skill',
        'position', jsonb_build_object('x', 200, 'y', 340),
        'data', jsonb_build_object(
          'label', 'Cerrar Pedido',
          'skillType', 'checkout_trigger'
        )
      ),
      jsonb_build_object(
        'id', 'node_name',
        'type', 'question',
        'position', jsonb_build_object('x', 300, 'y', 450),
        'data', jsonb_build_object(
          'label', 'Nombre',
          'message', 'Para coordinar tu entrega, ¿cuál es tu nombre completo?',
          'variable', 'customer_name'
        )
      ),
      jsonb_build_object(
        'id', 'node_phone',
        'type', 'question',
        'position', jsonb_build_object('x', 300, 'y', 550),
        'data', jsonb_build_object(
          'label', 'Teléfono',
          'message', '¿A qué número de teléfono te podemos contactar?',
          'variable', 'phone',
          'validation', 'phone'
        )
      ),
      jsonb_build_object(
        'id', 'node_addr',
        'type', 'question',
        'position', jsonb_build_object('x', 300, 'y', 650),
        'data', jsonb_build_object(
          'label', 'Dirección',
          'message', '¿Cuál es la dirección exacta para tu entrega?',
          'variable', 'direccion_entrega'
        )
      ),
      jsonb_build_object(
        'id', 'node_register',
        'type', 'action',
        'position', jsonb_build_object('x', 300, 'y', 750),
        'data', jsonb_build_object(
          'label', 'Registrar Pedido',
          'actionType', 'register_order'
        )
      ),
      jsonb_build_object(
        'id', 'node_end',
        'type', 'end',
        'position', jsonb_build_object('x', 300, 'y', 850),
        'data', jsonb_build_object(
          'label', 'Fin',
          'message', '¡Muchas gracias! Tu pedido ha sido confirmado y está en preparación. 🛵✨'
        )
      )
    ),
    'connections', jsonb_build_array(
      jsonb_build_object('id', 'conn_start_agent', 'from', 'node_start', 'to', 'node_agent', 'fromPort', 'output', 'toPort', 'input'),
      jsonb_build_object('id', 'conn_skill_search', 'from', 'node_skill_search', 'to', 'node_agent', 'fromPort', 'skill_out', 'toPort', 'skills_in'),
      jsonb_build_object('id', 'conn_skill_cart', 'from', 'node_skill_cart', 'to', 'node_agent', 'fromPort', 'skill_out', 'toPort', 'skills_in'),
      jsonb_build_object('id', 'conn_skill_checkout', 'from', 'node_skill_checkout', 'to', 'node_agent', 'fromPort', 'skill_out', 'toPort', 'skills_in'),
      jsonb_build_object('id', 'conn_agent_name', 'from', 'node_agent', 'to', 'node_name', 'fromPort', 'output', 'toPort', 'input'),
      jsonb_build_object('id', 'conn_name_phone', 'from', 'node_name', 'to', 'node_phone', 'fromPort', 'output', 'toPort', 'input'),
      jsonb_build_object('id', 'conn_phone_addr', 'from', 'node_phone', 'to', 'node_addr', 'fromPort', 'output', 'toPort', 'input'),
      jsonb_build_object('id', 'conn_addr_register', 'from', 'node_addr', 'to', 'node_register', 'fromPort', 'output', 'toPort', 'input'),
      jsonb_build_object('id', 'conn_register_end', 'from', 'node_register', 'to', 'node_end', 'fromPort', 'output', 'toPort', 'input')
    )
  );

  -- Insertar el bot_flow por defecto si no existe
  INSERT INTO bot_flows (merchant_id, name, description, is_active, flow_data)
  VALUES (
    NEW.id,
    'Flujo Principal - ' || COALESCE(NEW.name, 'Ventas'),
    'Flujo omnicanal automático generado por Woox Engine con Agente IA y captura de órdenes.',
    true,
    v_flow_data
  )
  ON CONFLICT (merchant_id, name) DO NOTHING;

  -- Asegurar que el comercio quede con bot_mode = true y agent_id asignado
  UPDATE merchants 
  SET 
    bot_mode = true,
    agent_id = COALESCE(agent_id, '00000000-0000-0000-0000-000000000001')
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_generate_bot_flow ON merchants;
CREATE TRIGGER trg_auto_generate_bot_flow
AFTER INSERT ON merchants
FOR EACH ROW
EXECUTE FUNCTION auto_generate_default_bot_flow();
