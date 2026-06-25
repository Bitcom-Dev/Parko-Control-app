import { Modal, View, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { resize, general } from './style';
import { black, purple, white, lightOrange, orange, gray, lightGray } from './colors';
import { CustomTextBold, CustomTextMedium, CustomTextRegular } from './CustomText';
import { useMessage } from './messages';

const ModuleMenu = ({ visible, modules, user, onClose, onModuleSelect }) => {
	const { MenuModal: strings } = useMessage();

	const moduleConfig = {
		CONTROL: {
			icon: 'home-outline',
			iconLib: 'Ionicons',
			label: strings?.control || 'Control',
			desc: strings?.controlDesc || '',
			route: '/(app)',
		},
		CONTROL_VIDEO: {
			icon: 'videocam-outline',
			iconLib: 'Ionicons',
			label: strings?.controlVideo || 'Control Video',
			desc: strings?.controlVideoDesc || '',
			route: '/(app)/camera',
		},
		LPR: {
			icon: 'image-search',
			iconLib: 'MaterialIcons',
			label: strings?.lpr || 'ANPR',
			desc: strings?.lprDesc || '',
			route: '/(app)/lpr',
		},
		NOTA_CONSTATARE: {
			icon: 'document-text-outline',
			iconLib: 'Ionicons',
			label: strings?.notaConstatare || 'Nota de Constatare',
			desc: strings?.notaConstatareDesc || '',
			route: '/(app)/nota-constatare',
		},
		PV: {
			icon: 'gavel',
			iconLib: 'MaterialIcons',
			label: strings?.pv || 'Proces Verbal (PV)',
			desc: strings?.pvDesc || '',
			route: '/(app)/pv',
		},
	};

	const handleModulePress = (moduleName) => {
		const config = moduleConfig[moduleName];
		if (config) {
			onModuleSelect(config.route);
		}
		onClose();
	};

	const renderIcon = (config) => {
		if (config.iconLib === 'MaterialIcons') {
			return <MaterialIcons name={config.icon} size={resize(22)} color={purple} />;
		}
		return <Ionicons name={config.icon} size={resize(22)} color={purple} />;
	};

	return (
		<Modal
			visible={visible}
			transparent={true}
			animationType="slide"
			onRequestClose={onClose}
		>
			<TouchableOpacity
				style={styles.backdrop}
				activeOpacity={1}
				onPress={onClose}
			>
				<TouchableOpacity
					activeOpacity={1}
					onPress={(e) => e.stopPropagation()}
					style={styles.sheet}
				>
					{/* Header */}
					<View style={styles.header}>
						<View style={styles.headerDecorL} />
						<View style={styles.headerDecorR} />
						<View style={styles.headerContent}>
							<View>
								<CustomTextBold style={styles.headerTitle}>
									{strings?.selectModule || 'Select Module'}
								</CustomTextBold>
								{user?.name ? (
									<CustomTextRegular style={styles.headerSub}>
										{user.name}
									</CustomTextRegular>
								) : null}
							</View>
							<TouchableOpacity onPress={onClose} style={styles.closeBtn}>
								<Ionicons name="close" size={resize(20)} color={white} />
							</TouchableOpacity>
						</View>
					</View>

					{/* Module list */}
					<ScrollView
						style={styles.body}
						contentContainerStyle={styles.bodyContent}
						showsVerticalScrollIndicator={false}
					>
						{modules && modules.map((module, index) => {
							const config = moduleConfig[module];
							if (!config) return null;

							return (
								<TouchableOpacity
									key={index}
									activeOpacity={0.8}
									style={styles.item}
									onPress={() => handleModulePress(module)}
								>
									<View style={styles.iconWrap}>
										{renderIcon(config)}
									</View>
									<CustomTextMedium style={styles.itemLabel}>
										{config.label}
									</CustomTextMedium>
									<MaterialIcons name="chevron-right" size={resize(20)} color={gray} />
								</TouchableOpacity>
							);
						})}
					</ScrollView>
				</TouchableOpacity>
			</TouchableOpacity>
		</Modal>
	);
};

const styles = StyleSheet.create({
	backdrop: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.1)',
		justifyContent: 'flex-end',
	},
	sheet: {
		backgroundColor: lightOrange,
		borderTopLeftRadius: resize(24),
		borderTopRightRadius: resize(24),
		overflow: 'hidden',
		maxHeight: '75%',
	},
	header: {
		backgroundColor: purple,
		paddingTop: resize(20),
		paddingBottom: resize(18),
		paddingHorizontal: resize(20),
		overflow: 'hidden',
	},
	headerDecorL: {
		position: 'absolute',
		width: resize(120),
		height: resize(120),
		borderRadius: resize(60),
		backgroundColor: 'rgba(255,255,255,0.07)',
		top: -resize(40),
		left: -resize(30),
	},
	headerDecorR: {
		position: 'absolute',
		width: resize(90),
		height: resize(90),
		borderRadius: resize(45),
		backgroundColor: 'rgba(255,255,255,0.07)',
		top: -resize(20),
		right: resize(20),
	},
	headerContent: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	headerTitle: {
		...general.fontSize16,
		color: white,
	},
	headerSub: {
		...general.fontSize10,
		color: 'rgba(255,255,255,0.75)',
		marginTop: resize(2),
	},
	closeBtn: {
		backgroundColor: 'rgba(255,255,255,0.2)',
		borderRadius: resize(20),
		padding: resize(6),
	},
	body: {
		backgroundColor: lightOrange,
	},
	bodyContent: {
		padding: resize(16),
		gap: resize(10),
	},
	item: {
		backgroundColor: white,
		borderRadius: resize(14),
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: resize(14),
		paddingHorizontal: resize(14),
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.06,
		shadowRadius: 4,
		elevation: 2,
	},
	iconWrap: {
		width: resize(40),
		height: resize(40),
		borderRadius: resize(12),
		backgroundColor: lightOrange,
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: resize(14),
	},
	itemLabel: {
		...general.fontSize12,
		color: black,
		flex: 1,
	},
});

export default ModuleMenu;
