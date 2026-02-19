import { Modal, View, TouchableOpacity, ScrollView } from 'react-native';
import { MaterialIcons, AntDesign } from '@expo/vector-icons';
import { resize, general } from './style';
import { black, purple, white } from './colors';
import { CustomTextMedium } from './CustomText';
import { useMessage } from './messages';

const ModuleMenu = ({ visible, modules, user, onClose, onModuleSelect }) => {
	const { MenuModal: strings } = useMessage();

	const moduleConfig = {
		CONTROL: {
			icon: 'home',
			label: strings?.control || 'Control',
			route: '/(app)',
		},
		CONTROL_VIDEO: {
			icon: 'videocam',
			label: strings?.controlVideo || 'Control Video',
			route: '/(app)/camera',
		},
		LPR: {
			icon: 'image-search',
			label: strings?.lpr || 'ANPR',
			route: '/(app)/lpr',
		},
		NOTA_CONSTATARE: {
			icon: 'description',
			label: strings?.notaConstatare || 'Nota de Constatare',
			route: '/(app)/nota-constatare',
		},
	};

	const handleModulePress = (moduleName) => {
		const config = moduleConfig[moduleName];
		if (config) {
			onModuleSelect(config.route);
		}
		onClose();
	};

	return (
		<Modal
			visible={visible}
			transparent={true}
			animationType="fade"
			onRequestClose={onClose}
		>
			<TouchableOpacity
				style={{
					flex: 1,
					backgroundColor: 'rgba(0, 0, 0, 0.5)',
					justifyContent: 'center',
					alignItems: 'center',
				}}
				activeOpacity={1}
				onPress={onClose}
			>
				<TouchableOpacity
					activeOpacity={1}
					onPress={(e) => e.stopPropagation()}
					style={{
						backgroundColor: white,
						borderRadius: resize(15),
						padding: resize(20),
						width: '80%',
						maxHeight: '70%',
					}}
				>
					<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: resize(20) }}>
						<CustomTextMedium style={{ ...general.fontSize14, color: black }}>
							{strings?.selectModule || 'Select Module'}
						</CustomTextMedium>
						<TouchableOpacity onPress={onClose}>
							<AntDesign name="close" size={resize(24)} color={black} />
						</TouchableOpacity>
					</View>

					<ScrollView showsVerticalScrollIndicator={false}>
						{modules && modules.map((module, index) => {
							const config = moduleConfig[module];
							if (!config) return null;

							return (
								<TouchableOpacity
									key={index}
									style={{
										flexDirection: 'row',
										alignItems: 'center',
										paddingVertical: resize(15),
										paddingHorizontal: resize(10),
										borderBottomWidth: index < modules.length - 1 ? resize(1) : 0,
										borderBottomColor: '#e0e0e0',
									}}
									onPress={() => handleModulePress(module)}
								>
									<MaterialIcons name={config.icon} size={resize(28)} color={purple} style={{ marginRight: resize(15) }} />
									<CustomTextMedium style={{ ...general.fontSize12, color: black, flex: 1 }}>
										{config.label}
									</CustomTextMedium>
									<AntDesign name="right" size={resize(18)} color={purple} />
								</TouchableOpacity>
							);
						})}
					</ScrollView>
				</TouchableOpacity>
			</TouchableOpacity>
		</Modal>
	);
};

export default ModuleMenu;
