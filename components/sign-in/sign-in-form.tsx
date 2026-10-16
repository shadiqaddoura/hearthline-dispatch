"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import {
  Button,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  ToggleButton,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { EyeOffRegular, EyeRegular } from "@fluentui/react-icons";
import {
  validateSignIn,
  type SignInCredentials,
  type SignInFieldErrors,
  type SignInHandler,
} from "@/lib/auth/sign-in";

const useStyles = makeStyles({
  form: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },
  submit: { marginTop: tokens.spacingVerticalXS },
});

interface SignInFormProps {
  onSignIn: SignInHandler;
  /** Called after a successful sign-in. */
  onSignedIn?: () => void;
}

export function SignInForm({ onSignIn, onSignedIn }: SignInFormProps) {
  const styles = useStyles();
  const [values, setValues] = useState<SignInCredentials>({ email: "", password: "" });
  const [errors, setErrors] = useState<SignInFieldErrors>({});
  // Fields re-validate as you type only once a submit has shown errors.
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [pending, startTransition] = useTransition();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const update = (field: keyof SignInCredentials, value: string) => {
    const next = { ...values, [field]: value };
    setValues(next);
    if (submitted) setErrors(validateSignIn(next));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setSubmitted(true);
    setFormError(null);
    const fieldErrors = validateSignIn(values);
    setErrors(fieldErrors);
    if (fieldErrors.email) return emailRef.current?.focus();
    if (fieldErrors.password) return passwordRef.current?.focus();

    startTransition(async () => {
      try {
        const result = await onSignIn(values);
        if (result.ok) onSignedIn?.();
        else setFormError(result.message);
      } catch {
        setFormError("Something went wrong while signing in. Try again.");
      }
    });
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate aria-busy={pending} aria-label="Sign in">
      {formError && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>
            <MessageBarTitle>Couldn&apos;t sign you in.</MessageBarTitle> {formError}
          </MessageBarBody>
        </MessageBar>
      )}

      <Field label="Email" required validationMessage={errors.email}>
        <Input
          ref={emailRef}
          type="email"
          name="email"
          autoComplete="username"
          value={values.email}
          onChange={(_, data) => update("email", data.value)}
          readOnly={pending}
        />
      </Field>

      <Field label="Password" required validationMessage={errors.password}>
        <Input
          ref={passwordRef}
          type={passwordVisible ? "text" : "password"}
          name="password"
          autoComplete="current-password"
          value={values.password}
          onChange={(_, data) => update("password", data.value)}
          readOnly={pending}
          contentAfter={
            <ToggleButton
              appearance="transparent"
              size="small"
              checked={passwordVisible}
              onClick={() => setPasswordVisible((visible) => !visible)}
              icon={passwordVisible ? <EyeOffRegular /> : <EyeRegular />}
              aria-label="Show password"
            />
          }
        />
      </Field>

      <Button
        type="submit"
        appearance="primary"
        size="large"
        className={styles.submit}
        disabledFocusable={pending}
        icon={pending ? <Spinner size="tiny" appearance="inverted" /> : undefined}
      >
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
