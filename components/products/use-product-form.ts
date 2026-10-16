"use client";

import { useRef, useState } from "react";
import { ApiRequestError } from "@/lib/api/client";
import type { ProductDto, ProductField, ProductInput } from "@/lib/contracts/products";
import {
  PRODUCT_FIELD_ORDER,
  firstInvalidField,
  parseProductForm,
  type ProductFormErrors,
  type ProductFormValues,
} from "@/lib/products/product-form";

export interface FormProblem {
  title: string;
  message: string;
}

/** Where keyboard focus should go after a failed submit: the first invalid field, or the problem message. */
export interface FocusRequest {
  target: ProductField | "problem";
  /** Changes on every request so asking for the same target twice still moves focus. */
  id: number;
}

interface ProductFormOptions {
  initial: ProductFormValues;
  /** Sends the request: create or update. */
  submit: (input: ProductInput) => Promise<ProductDto>;
  /** "created" or "saved", for the message shown when the outcome can't be confirmed. */
  verb: "created" | "saved";
  /** Called once, only after the server has confirmed the change. */
  onSaved: (product: ProductDto) => void;
  /** The server's answer shows what the person saw is out of date: reload the catalogue and details. */
  onDataChanged: () => void;
}

/**
 * The product form's state: typed values, errors beside their fields, one request at a
 * time, and nothing reported as saved until the server says so. Values stay as typed
 * whatever the outcome.
 */
export function useProductForm({ initial, submit, verb, onSaved, onDataChanged }: ProductFormOptions) {
  const [values, setValues] = useState<ProductFormValues>(initial);
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [problem, setProblem] = useState<FormProblem | null>(null);
  const [pending, setPending] = useState(false);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  // A ref, not state: a second click in the same frame must already see the request in flight.
  const inFlight = useRef(false);
  const requests = useRef(0);

  const askFocus = (target: FocusRequest["target"]) => setFocusRequest({ target, id: ++requests.current });

  const setValue = <K extends keyof ProductFormValues>(field: K, value: ProductFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };

  const save = async () => {
    if (inFlight.current) return;
    const parsed = parseProductForm(values);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      setProblem(null);
      askFocus(firstInvalidField(parsed.errors) ?? "problem");
      return;
    }

    inFlight.current = true;
    setPending(true);
    setErrors({});
    setProblem(null);
    try {
      onSaved(await submit(parsed.input));
    } catch (error) {
      const failure = explain(error, verb);
      if (failure.refresh) onDataChanged();
      setErrors(failure.fieldErrors);
      setProblem(failure.problem);
      askFocus(firstInvalidField(failure.fieldErrors) ?? "problem");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return { values, errors, problem, pending, focusRequest, setValue, save };
}

interface Explained {
  fieldErrors: ProductFormErrors;
  problem: FormProblem;
  refresh: boolean;
}

function explain(error: unknown, verb: "created" | "saved"): Explained {
  if (!(error instanceof ApiRequestError)) {
    return {
      fieldErrors: {},
      refresh: false,
      problem: { title: "Something went wrong.", message: "The product wasn't saved. Try again." },
    };
  }

  // The request never got an answer, or the server failed: the outcome is unknown, not "no".
  if (!error.isRejection) {
    return {
      fieldErrors: {},
      refresh: true,
      problem: {
        title: `We couldn't confirm the product was ${verb}.`,
        message: `${error.message} The product list has been reloaded: check it before trying again.`,
      },
    };
  }

  const fieldErrors: ProductFormErrors = {};
  for (const field of PRODUCT_FIELD_ORDER) {
    const message = error.fieldErrors[field]?.[0];
    if (message) fieldErrors[field] = message;
  }

  switch (error.code) {
    case "NOT_FOUND":
      return {
        fieldErrors,
        refresh: true,
        problem: {
          title: "This product no longer exists.",
          message: "Someone else may have deleted it. The product list has been reloaded.",
        },
      };
    case "INVALID_STATE":
      return {
        fieldErrors,
        refresh: true,
        problem: { title: "Those changes can't be saved.", message: `${error.message}. The details below have been refreshed.` },
      };
    case "CONFLICT":
      return { fieldErrors, refresh: false, problem: { title: "Check the details.", message: error.message } };
    default:
      return {
        fieldErrors,
        refresh: false,
        problem: {
          title: "Check the details.",
          message: Object.keys(fieldErrors).length > 0 ? "Fix the fields marked below, then save again." : error.message,
        },
      };
  }
}
