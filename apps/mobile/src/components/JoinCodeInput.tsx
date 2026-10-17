import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text, TextInput, View } from "react-native";

import { useGroupsStyles, useReducedMotion, haptics } from "@theme";
import { JOIN_CODE_LENGTH, cleanJoinCodeInput } from "@data";

interface JoinCodeInputProps {
  value: string;
  onChange: (code: string) => void;
  /** A full code, the moment the last box fills. */
  onComplete: (code: string) => void;
  /** Drawn in the danger colour - the last code was refused. */
  invalid?: boolean;
  /** Bump to shake the row: the code just tried was wrong. */
  shakeKey?: number;
  disabled?: boolean;
}

/** How far, and how many times, a refused code shakes its head. */
const SHAKE_DISTANCE = 8;
const SHAKE_STEP_MS = 50;

/**
 * Six boxes for a group's join code, filled as it is typed.
 *
 * One real TextInput sits invisibly over the boxes and does all the work -
 * keyboard, paste, delete, autofill - so the boxes are only a drawing of its
 * value. Separate inputs per box would each need their own focus juggling,
 * and pasting a whole code into one of them would be lost.
 *
 * Letters and digits only, upper-cased as they arrive: a pasted "k3p-q7x"
 * fills the row as K3PQ7X. Each new character ticks; a full row hands the
 * code to onComplete straight away, so there is no Join button to find.
 */
const JoinCodeInput = ({
  value,
  onChange,
  onComplete,
  invalid = false,
  shakeKey = 0,
  disabled = false,
}: JoinCodeInputProps) => {
  const styles = useGroupsStyles();
  const reducedMotion = useReducedMotion();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  const shake = useRef(new Animated.Value(0)).current;
  const firstShake = useRef(true);
  useEffect(() => {
    // Not on mount: a fresh row has nothing to be wrong about.
    if (firstShake.current) {
      firstShake.current = false;
      return;
    }
    if (reducedMotion) return;
    const step = (to: number) =>
      Animated.timing(shake, { toValue: to, duration: SHAKE_STEP_MS, useNativeDriver: true });
    Animated.sequence([
      step(SHAKE_DISTANCE),
      step(-SHAKE_DISTANCE),
      step(SHAKE_DISTANCE / 2),
      step(-SHAKE_DISTANCE / 2),
      step(0),
    ]).start();
  }, [shakeKey, reducedMotion, shake]);

  const change = (text: string) => {
    const next = cleanJoinCodeInput(text);
    if (next === value) return;
    if (next.length > value.length) haptics.tick();
    onChange(next);
    if (next.length === JOIN_CODE_LENGTH) onComplete(next);
  };

  // The box the next character lands in - lit while the keyboard is up.
  const activeIndex = Math.min(value.length, JOIN_CODE_LENGTH - 1);

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      disabled={disabled}
      // The input inside is the accessible element; this is only its target.
      accessible={false}
    >
      <Animated.View style={[styles.codeBoxes, { transform: [{ translateX: shake }] }]}>
        {Array.from({ length: JOIN_CODE_LENGTH }, (_, index) => {
          const char = value[index] ?? "";
          const isActive = focused && index === activeIndex && !disabled;
          return (
            <View
              key={index}
              style={[
                styles.codeBox,
                char ? styles.codeBoxFilled : null,
                isActive ? styles.codeBoxActive : null,
                invalid ? styles.codeBoxInvalid : null,
              ]}
            >
              <Text style={styles.codeBoxChar}>{char}</Text>
            </View>
          );
        })}

        <TextInput
          ref={inputRef}
          style={styles.codeHiddenInput}
          value={value}
          onChangeText={change}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          editable={!disabled}
          // Room for a pasted code with its dash or spaces; cleaned to six.
          maxLength={JOIN_CODE_LENGTH * 2}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          keyboardType="ascii-capable"
          returnKeyType="go"
          onSubmitEditing={() => {
            if (value.length === JOIN_CODE_LENGTH) onComplete(value);
          }}
          caretHidden
          accessibilityLabel={`Group code, ${JOIN_CODE_LENGTH} characters`}
          accessibilityValue={{ text: value.split("").join(" ") || "empty" }}
        />
      </Animated.View>
    </Pressable>
  );
};

export default JoinCodeInput;
