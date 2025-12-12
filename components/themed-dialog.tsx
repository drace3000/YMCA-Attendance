import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export type DialogButton = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
  align?: 'left' | 'right';
};

export type ThemedDialogProps = {
  visible: boolean;
  title?: React.ReactNode;
  message?: React.ReactNode;
  buttons?: DialogButton[];
  onClose?: () => void;
  allowBackdropClose?: boolean;
  customButtons?: React.ReactNode;
};

const ThemedDialog = ({
  visible,
  title,
  message,
  buttons,
  onClose,
  allowBackdropClose = true,
  customButtons,
}: ThemedDialogProps) => {
  const resolvedButtons = (buttons?.length ? buttons : [{ label: 'OK', onPress: onClose }]).map((btn) => ({
    ...btn,
    variant: btn.variant ?? 'primary',
    align: btn.align ?? 'right',
  }));

  const leftButtons = resolvedButtons.filter((btn) => btn.align === 'left');
  const rightButtons = resolvedButtons.filter((btn) => btn.align !== 'left');

  const handleClose = () => {
    onClose?.();
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={handleClose}>
      <Pressable
        style={styles.overlay}
        onPress={
          allowBackdropClose
            ? () => {
                handleClose();
              }
            : undefined
        }>
        <Pressable
          style={styles.cardOuter}
          onPress={(e) => {
            e.stopPropagation();
          }}>
          <LinearGradient
            colors={['#01A490', '#0f172a']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}>
            {title
              ? typeof title === 'string'
                ? <Text style={styles.title}>{title}</Text>
                : title
              : null}
            {message
              ? typeof message === 'string'
                ? <Text style={styles.message}>{message}</Text>
                : message
              : null}
            {customButtons ? (
              customButtons
            ) : (
              <View style={styles.buttonsRow}>
                <View style={styles.buttonsLeft}>
                  {leftButtons.map((button, idx) => (
                    <Pressable
                      key={`left-${button.label}-${idx}`}
                      style={[
                        styles.button,
                        button.variant === 'secondary' ? styles.buttonSecondary : styles.buttonPrimary,
                      ]}
                      onPress={() => {
                        button.onPress?.();
                        handleClose();
                      }}
                      hitSlop={8}>
                      <Text
                        style={[
                          styles.buttonText,
                          button.variant === 'secondary' ? styles.buttonTextSecondary : styles.buttonTextPrimary,
                        ]}>
                        {button.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.buttonsRight}>
                  {rightButtons.map((button, idx) => (
                    <Pressable
                      key={`right-${button.label}-${idx}`}
                      style={[
                        styles.button,
                        button.variant === 'secondary' ? styles.buttonSecondary : styles.buttonPrimary,
                      ]}
                      onPress={() => {
                        button.onPress?.();
                        handleClose();
                      }}
                      hitSlop={8}>
                      <Text
                        style={[
                          styles.buttonText,
                          button.variant === 'secondary' ? styles.buttonTextSecondary : styles.buttonTextPrimary,
                        ]}>
                        {button.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </LinearGradient>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    top: 30,
    bottom: -30,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardOuter: {
    width: '90%',
    maxWidth: 420,
    alignSelf: 'center',
    borderRadius: 16,
    overflow: 'hidden',
    transform: [{ translateY: 10 }],
  },
  card: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: 'rgba(248,250,252,0.35)',
    gap: 10,
  },
  title: { color: '#facc15', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  titleIcon: { width: 36, height: 36, resizeMode: 'contain' },
  message: { color: '#e2e8f0', fontSize: 15, lineHeight: 21 },
  buttonsRow: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonsLeft: { flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'flex-start', flexWrap: 'wrap' },
  buttonsRight: { flexShrink: 0, flexDirection: 'row', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' },
  button: {
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  buttonPrimary: {
    backgroundColor: '#facc15',
    borderColor: '#facc15',
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(248,250,252,0.65)',
  },
  buttonText: { fontWeight: '700', fontSize: 15 },
  buttonTextPrimary: { color: '#0f172a' },
  buttonTextSecondary: { color: '#f8fafc' },
});

export default ThemedDialog;