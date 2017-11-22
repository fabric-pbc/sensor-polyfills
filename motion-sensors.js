// @ts-check


// dictionary SensorOptions {
//  double frequency;
//};

//[SecureContext, Exposed=Window]
//interface Sensor : EventTarget {
//  readonly attribute boolean activated;
//  readonly attribute boolean hasReading;
//  readonly attribute DOMHighResTimeStamp? timestamp;
//  void start();
//  void stop();
//  attribute EventHandler onreading;
//  attribute EventHandler onactivate;
//  attribute EventHandler onerror;
//};

const slot = window["__sensor__"] = Symbol("__sensor__");

function defineProperties(target, descriptions) {
  for (const property in descriptions) {
    Object.defineProperty(target, property, {
      configurable: true,
      value: descriptions[property]
    });
  }
}

class EventTarget {
  constructor() {
    this[slot] = new WeakMap;
    const _listeners = {};

    const defineOnEventListener = type => {
      Object.defineProperty(this, `on${type}`, {
        set: value => {
          let listeners = _listeners[type] || (_listeners[type] = [ null ]);
          listeners[0] = { target: this, listener: value };
        },
        get: () => {
          let listeners = _listeners[type] || (_listeners[type] = [ null ]);
          return listeners[0];
        }
      });
    };

    const addEventListener = (type, listener, options) => {
      let listeners = _listeners[type] || (_listeners[type] = [ null ]);
      if (listeners.findIndex(entry => entry && entry.listener === listener) < 1) {
        listeners.push({ target: this, listener: listener, options: options });
      }
    };

    const removeEventListener = (type, listener, options) => {
      let listeners = _listeners[type];
      if (listeners) {
        const index = listeners.findIndex(entry => entry && entry.listener === listener);
        if (index > 0) {
          listeners.splice(index, 1);
        }
      }
    };

    const dispatchEvent = (event) => {
      const listeners = _listeners[event.type];
      if (listeners) {
        defineProperties(event, { currentTarget: this, target: this });

        for (const { target, listener, options } of listeners) {
          if (options && options.once) {
            removeEventListener.call(target, event.type, listener, options);
          }
          if (typeof listener === 'function') {
            listener.call(target, event);
          } else {
            listener.handleEvent(event);
          }
        }

        defineProperties(event, { currentTarget: null, target: null });
      }
      return true;
    }

    defineProperties(this, {
      addEventListener: addEventListener,
      removeEventListener: removeEventListener,
      dispatchEvent: dispatchEvent
    });

    this[slot].defineOnEventListener = defineOnEventListener
  }
}

function defineReadonlyProperties(target, slot, descriptions) {
  const propertyBag = target[slot] || (target[slot] = new WeakMap);
  for (const property in descriptions) {
    propertyBag[property] = descriptions[property];
    Object.defineProperty(target, property, {
      get: () => propertyBag[property]
    });
  }
}

export class Sensor extends EventTarget {
  constructor(options) {
    super();
    this[slot].defineOnEventListener("reading");
    this[slot].defineOnEventListener("activate");
    this[slot].defineOnEventListener("error");

    defineReadonlyProperties(this, slot, {
      activated: false,
      hasReading: false,
      timestamp: 0
    })

    this[slot].frequency = null;

    if (window && window.parent != window.top) {
      throw new DOMException("Only instantiable in a top-level browsing context", "SecurityError");
    }

    if (options && typeof(options.frequency) == "number") {
      if (options.frequency > 60) {
        this.frequency = options.frequency;
      }
    }
  }

  start() { }
  stop() { }
}

 function toQuaternion(mat) {
	const w = Math.sqrt(1.0 + mat[0] + mat[5] + mat[10]) / 2.0;
	const w4 = (4.0 * w);
	const x = (mat[9] - mat[6]) / w4;
	const y = (mat[2] - mat[8]) / w4;
  const z = (mat[4] - mat[1]) / w4;

  return [x, y, z, w];
}

function toMat4(mat, alpha, beta, gamma) {
  const degToRad = Math.PI / 180

  const z = (alpha || 0) * degToRad;
  const x = (beta || 0) * degToRad;
  const y = (gamma || 0) * degToRad;

  const cX = Math.cos(x);
  const cY = Math.cos(y);
  const cZ = Math.cos(z);
  const sX = Math.sin(x);
  const sY = Math.sin(y);
  const sZ = Math.sin(z);

  const typed = mat instanceof Float32Array || mat instanceof Float64Array;

  if (typed && mat.length >= 16) {
    mat[0] = cZ * cY - sZ * sX * sY;
    mat[1] = - cX * sZ;
    mat[2] = cY * sZ * sX + cZ * sY;
    mat[3] = 0;

    mat[4] = cY * sZ + cZ * sX * sY;
    mat[5] = cZ * cX;
    mat[6] = sZ * sY - cZ * cY * sX;
    mat[7] = 0;

    mat[8] = - cX * sY;
    mat[9] = sX;
    mat[10] = cX * cY;
    mat[11] = 0;

    mat[12] = 0;
    mat[13] = 0;
    mat[14] = 0;
    mat[15] = 1;
  }

  return mat;
};

class SensorErrorEvent extends Event {
  constructor(type, errorEventInitDict) {
    super(type, errorEventInitDict);

    if (!errorEventInitDict || !errorEventInitDict.error instanceof DOMException) {
      throw TypeError(
        "Failed to construct 'SensorErrorEvent':" +
        "2nd argument much contain 'error' property"
      );
    }

    Object.defineProperty(this, "error", {
      configurable: false,
      writable: false,
      value: errorEventInitDict.error
    });
  }
};

export class RelativeOrientationSensor extends Sensor {
  constructor(options) {
    super(options);
    const slot = window["__sensor__"];

    this[slot].handleEvent = event => {
      // If there is no sensor we will get values equal to null.
      if (event.absolute || event.alpha === null) {
        // Spec: The implementation can still decide to provide
        // absolute orientation if relative is not available or
        // the resulting data is more accurate. In either case,
        // the absolute property must be set accordingly to reflect
        // the choice.

        let error = new SensorErrorEvent("error", {
          error: new DOMException("Could not connect to a sensor")
        });
        this.dispatchEvent(error);

        this.stop();
        return;
      }

      this[slot].timestamp = Date.now();

      this[slot].alpha = event.alpha;
      this[slot].beta = event.beta;
      this[slot].gamma = event.gamma;

      this[slot].hasReading = true;

      let reading = new Event("reading");
      this.dispatchEvent(reading);
    }
    Object.defineProperty(this, "quaternion", {
      get: () => {
        let mat = new Float32Array(16);
        this.populateMatrix(mat);
        return toQuaternion(mat);
      }
    });
  }

  populateMatrix(mat) {
    toMat4(mat, this[slot].alpha, this[slot].beta, this[slot].gamma);
  }

  start() {
    super.start();

    let activate = new Event("activate");

    window.addEventListener('deviceorientation', this[slot].handleEvent, false);
    this[slot].activated = true;
    this.dispatchEvent(activate);
  }

  stop() {
    super.stop();

    window.removeEventListener('deviceorientation', this[slot].handleEvent, false);
    this[slot].activated = false;
  }
}

export class AbsoluteOrientationSensor extends Sensor {
  constructor(options) {
    super(options);
    const slot = window["__sensor__"];

    this[slot].handleEvent = event => {
      // If there is no sensor or we cannot get absolute values,
      // we will get values equal to null.
      if (!event.absolute || event.alpha === null) {
        // Spec: If an implementation can never provide absolute 
        // orientation information, the event should be fired with 
        // the alpha, beta and gamma attributes set to null.

        let error = new SensorErrorEvent("error", {
          error: new DOMException("Could not connect to a sensor")
        });
        this.dispatchEvent(error);

        this.stop();
        return;
      }

      this[slot].timestamp = Date.now();

      this[slot].alpha = event.alpha;
      this[slot].beta = event.beta;
      this[slot].gamma = event.gamma;

      this[slot].hasReading = true;

      let reading = new Event("reading");
      this.dispatchEvent(reading);
    }
    Object.defineProperty(this, "quaternion", {
      get: () => {
        let mat = new Float32Array(16);
        this.populateMatrix(mat);
        return toQuaternion(mat);
      }
    });
  }

  populateMatrix(mat) {
    toMat4(mat, this[slot].alpha, this[slot].beta, this[slot].gamma);
  }

  start() {
    super.start();

    let activate = new Event("activate");
    window.addEventListener('deviceorientationabsolute', this[slot].handleEvent, false);
    this[slot].activated = true;
    this.dispatchEvent(activate);
  }

  stop() {
    super.stop();

    window.removeEventListener('deviceorientationabsolute', this[slot].handleEvent, false);
    this[slot].activated = false;
  }
}